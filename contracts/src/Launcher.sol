// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPonsFactory} from "./interfaces/IPons.sol";
import {CollectionRegistry} from "./CollectionRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {Vault} from "./Vault.sol";
import {VaultFactory, RouterFactory} from "./Factories.sol";

interface IPonsFactoryExtra {
    function maxCreatorTaxBps() external view returns (uint256);
}

/// @title Launcher
/// @notice The single entry point for creating a coin. One transaction: it launches the coin on Pons with a
///         fresh FeeRouter as the fee recipient, makes sure the collection has its vault, and binds
///         everything permanently.
/// @dev All configuration is immutable and there is no owner. The Launcher is the Pons "creator" of every
///      coin but has no function that could redirect a coin's fees afterwards, so the router stays the
///      recipient forever.
contract Launcher {
    struct LaunchInput {
        string name;
        string symbol;
        string logo;
        string description;
        IPonsFactory.Socials socials;
        address collection;
        Vault.Policy policy;
        uint16 creatorTaxBps;
        bytes32 salt;
    }

    struct CoinInfo {
        address creator;
        address curve;
        address router;
        address vault;
        address collection;
        Vault.Policy policy;
        uint64 launchedAt;
    }

    uint256 public constant LAUNCH_CONFIG_ID = 0;
    uint256 public constant MAX_CREATOR_TAX_BPS_LIMIT = 1_000;

    IPonsFactory public immutable factory;
    CollectionRegistry public immutable registry;
    address public immutable seaport;
    address public immutable distributor;
    address public immutable escrow;
    address public immutable hook;
    address public immutable treasury;
    VaultFactory public immutable vaultFactory;
    RouterFactory public immutable routerFactory;
    uint256 public immutable vaultHardMaxCap;
    uint256 public immutable vaultDailyLimit;

    mapping(address coin => CoinInfo) private _coins;
    address[] private _launched;

    uint256 private _lock = 1;

    event CoinLaunched(
        address indexed coin,
        address indexed creator,
        address indexed collection,
        address curve,
        address router,
        address vault,
        Vault.Policy policy,
        uint16 creatorTaxBps
    );
    /// @dev Display data for indexers; kept in its own event so CoinLaunched stays small.
    event CoinMetadata(address indexed coin, string name, string symbol, string logo, string description);
    /// @dev Social links for indexers, in their own event for the same reason.
    event CoinSocials(address indexed coin, string twitter, string telegram, string discord, string website, string farcaster);
    event VaultCreated(address indexed collection, address indexed vault);

    error ZeroAddress();
    error NotListed();
    error WrongPolicy();
    error TaxTooHigh();
    error LaunchFeeTooLow();
    error RefundFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address factory_,
        address registry_,
        address seaport_,
        address distributor_,
        address escrow_,
        address hook_,
        address treasury_,
        address vaultFactory_,
        address routerFactory_,
        uint256 vaultHardMaxCap_,
        uint256 vaultDailyLimit_
    ) {
        if (
            factory_ == address(0) || registry_ == address(0) || seaport_ == address(0) || distributor_ == address(0)
                || escrow_ == address(0) || hook_ == address(0) || treasury_ == address(0) || vaultFactory_ == address(0)
                || routerFactory_ == address(0)
        ) revert ZeroAddress();
        factory = IPonsFactory(factory_);
        registry = CollectionRegistry(registry_);
        seaport = seaport_;
        distributor = distributor_;
        escrow = escrow_;
        hook = hook_;
        treasury = treasury_;
        vaultFactory = VaultFactory(vaultFactory_);
        routerFactory = RouterFactory(routerFactory_);
        vaultHardMaxCap = vaultHardMaxCap_;
        vaultDailyLimit = vaultDailyLimit_;
    }

    /// @notice Launch a coin that sweeps `input.collection`. Send at least the Pons launch fee; any excess
    ///         is refunded. Everything chosen here is permanent.
    function launch(LaunchInput calldata input)
        external
        payable
        nonReentrant
        returns (address coin, address curve, address router)
    {
        if (!registry.isListed(input.collection)) revert NotListed();
        if (input.policy == Vault.Policy.None) revert WrongPolicy();
        if (input.creatorTaxBps > IPonsFactoryExtra(address(factory)).maxCreatorTaxBps()) revert TaxTooHigh();

        uint256 fee = factory.launchFee();
        if (msg.value < fee) revert LaunchFeeTooLow();

        address vault = _vaultFor(input.collection);

        // The router must exist before the coin so it can be named as the fee recipient.
        router = routerFactory.create(address(this), vault, treasury, escrow, hook);
        FeeRouter feeRouter = FeeRouter(payable(router));

        IPonsFactory.TokenParams memory params = IPonsFactory.TokenParams({
            name: input.name,
            symbol: input.symbol,
            logo: input.logo,
            description: input.description,
            socials: input.socials,
            creatorFeeRecipient: router,
            creatorTaxBps: input.creatorTaxBps,
            buybackEnabled: false,
            expectedEconomics: factory.previewLaunchEconomics(LAUNCH_CONFIG_ID, address(0)),
            salt: keccak256(abi.encode(msg.sender, input.salt))
        });
        (coin, curve) = factory.launchToken{value: fee}(params, LAUNCH_CONFIG_ID, address(0));

        feeRouter.bind(coin, curve);
        Vault(payable(vault)).registerCoin(coin, input.policy);

        _coins[coin] = CoinInfo({
            creator: msg.sender,
            curve: curve,
            router: router,
            vault: vault,
            collection: input.collection,
            policy: input.policy,
            launchedAt: uint64(block.timestamp)
        });
        _launched.push(coin);

        emit CoinLaunched(coin, msg.sender, input.collection, curve, router, vault, input.policy, input.creatorTaxBps);
        emit CoinMetadata(coin, input.name, input.symbol, input.logo, input.description);
        _emitSocials(coin, input.socials);

        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @dev Emitting the social links in a separate frame keeps launch() under the stack limit.
    function _emitSocials(address coin, IPonsFactory.Socials memory s) private {
        emit CoinSocials(coin, s.twitter, s.telegram, s.discord, s.website, s.farcaster);
    }

    // ---------------------------------------------------------------- views

    function coinInfo(address coin) external view returns (CoinInfo memory) {
        return _coins[coin];
    }

    function launchedCount() external view returns (uint256) {
        return _launched.length;
    }

    function launchedAt(uint256 index) external view returns (address) {
        return _launched[index];
    }

    // ---------------------------------------------------------------- internal

    /// @dev One vault per collection, created on the first coin and reused by every later one.
    function _vaultFor(address collection) private returns (address vault) {
        vault = registry.vaultOf(collection);
        if (vault != address(0)) return vault;

        vault = vaultFactory.create(
            collection, address(registry), seaport, distributor, address(this), vaultHardMaxCap, vaultDailyLimit
        );
        registry.registerVault(collection, vault);
        emit VaultCreated(collection, vault);
    }
}
