// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory, RouterFactory} from "../src/Factories.sol";
import {IPonsFactory, IPonsCurve, IPonsHook} from "../src/interfaces/IPons.sol";

interface ICurveState {
    function sellableTokens() external view returns (uint256);
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @notice Post-graduation fee path (Uniswap v4 pool + Pons hook) against live Pons on a Robinhood Chain fork.
///         Skipped without ROBINHOOD_RPC_URL.
contract SweepPoolForkTest is Test {
    address constant FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant PONSGUY = 0x9d1497d448a75E7d1A055D74cFfA50BC15120845;
    bytes32 constant POOL_REGISTERED = 0x01bf263a1db1652580721573296e1a1fa70b3d4c87f61d02a69c4e1109d2d573;
    address constant PONS_OPERATOR = 0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83;
    uint160 constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740;
    uint160 constant MAX_SQRT_PRICE_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    Launcher launcher;
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");

    // swap state used inside the unlock callback
    PoolKey private _key;
    bool private _buy;
    uint256 private _amount;
    address private _trader;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        CollectionRegistry registry = new CollectionRegistry(address(this));
        launcher = new Launcher(
            FACTORY,
            address(registry),
            SEAPORT,
            makeAddr("distributor"),
            ESCROW,
            HOOK,
            treasury,
            address(new VaultFactory()),
            address(new RouterFactory()),
            10 ether,
            5 ether
        );
        registry.setLauncher(address(launcher));
        registry.setKeeper(makeAddr("keeper"));
        registry.addCollection(PONSGUY);
        vm.deal(alice, 10 ether);
    }

    function _graduate() internal returns (address coin, address routerAddr, bytes32 poolId) {
        Launcher.LaunchInput memory i;
        i.name = "Grad";
        i.symbol = "GRAD";
        i.logo = "https://example.com/l.png";
        i.description = "d";
        i.collection = PONSGUY;
        i.policy = Vault.Policy.Burn;
        i.creatorTaxBps = 100;
        i.salt = "sp";
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        address curve;
        vm.prank(alice);
        (coin, curve, routerAddr) = launcher.launch{value: fee}(i);

        vm.warp(block.timestamp + 60);
        address whale = makeAddr("whale");
        vm.deal(whale, 100 ether);
        for (uint256 n = 0; n < 20 && ICurveState(curve).sellableTokens() > 0; n++) {
            vm.prank(whale);
            try IPonsCurve(curve).buy{value: 2 ether}(2 ether, 0, whale) {} catch { break; }
        }
        assertEq(ICurveState(curve).sellableTokens(), 0, "the curve sold out");

        // Moving the liquidity to Uniswap v4 is a separate, permissionless call on the Pons factory.
        vm.recordLogs();
        (bool ok,) = FACTORY.call(abi.encodeWithSignature("createGraduatedPool(address)", coin));
        require(ok, "createGraduatedPool failed");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 k = 0; k < logs.length; k++) {
            if (logs[k].emitter == HOOK && logs[k].topics[0] == POOL_REGISTERED) poolId = logs[k].topics[1];
        }
        assertTrue(poolId != bytes32(0), "pool id found in the hook event");
        _key = PoolKey(address(0), coin, 0, 200, HOOK);
        assertEq(keccak256(abi.encode(address(0), coin, uint24(0), int24(200), HOOK)), poolId, "pool key matches");
    }

    /// @dev Trade on the v4 pool as `who`: buy coins with `amount` ETH, or sell `amount` coins for ETH.
    function _swap(address who, bool buy, uint256 amount) internal {
        _buy = buy;
        _amount = amount;
        _trader = who;
        if (buy) {
            vm.deal(address(this), address(this).balance + amount);
        } else {
            vm.prank(who);
            IERC20Min(_key.currency1).transfer(address(this), amount);
        }
        IPoolManager(POOL_MANAGER).unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        require(msg.sender == POOL_MANAGER, "only pool manager");
        SwapParams memory p = SwapParams({
            zeroForOne: _buy,
            amountSpecified: -int256(_amount),
            sqrtPriceLimitX96: _buy ? MIN_SQRT_PRICE_PLUS_ONE : MAX_SQRT_PRICE_MINUS_ONE
        });
        int256 delta = IPoolManager(POOL_MANAGER).swap(_key, p, "");
        int128 a0 = int128(delta >> 128);
        int128 a1 = int128(delta);
        if (_buy) {
            IPoolManager(POOL_MANAGER).settle{value: _amount}();
            IPoolManager(POOL_MANAGER).take(_key.currency1, _trader, uint256(uint128(a1)));
        } else {
            IPoolManager(POOL_MANAGER).sync(_key.currency1);
            IERC20Min(_key.currency1).transfer(POOL_MANAGER, _amount);
            IPoolManager(POOL_MANAGER).settle();
            IPoolManager(POOL_MANAGER).take(address(0), _trader, uint256(uint128(a0)));
        }
        return "";
    }

    receive() external payable {}

    function test_postGraduationFeesAreSweptByPonsAndHarvestedByTheRouter() public {
        (address coin, address routerAddr, bytes32 poolId) = _graduate();
        FeeRouter router = FeeRouter(payable(routerAddr));
        Vault vault = Vault(payable(launcher.coinInfo(coin).vault));

        address trader = makeAddr("trader");
        _swap(trader, true, 1 ether);
        uint256 coins = IERC20Min(coin).balanceOf(trader);
        assertGt(coins, 0, "the v4 swap delivered coins");
        _swap(trader, false, coins / 2);

        for (uint256 c = 0; c < 2; c++) {
            address cur = c == 0 ? address(0) : coin;
            (, bytes memory a) = HOOK.staticcall(abi.encodeWithSignature("pendingFees(bytes32,address)", poolId, cur));
            (, bytes memory b) = HOOK.staticcall(abi.encodeWithSignature("pendingCreatorTax(bytes32,address)", poolId, cur));
            emit log_named_uint(c == 0 ? "pendingFees ETH" : "pendingFees coin", abi.decode(a, (uint256)));
            emit log_named_uint(c == 0 ? "pendingCreatorTax ETH" : "pendingCreatorTax coin", abi.decode(b, (uint256)));
        }
        // The router cannot sweep itself: converting the coin-denominated fees needs the Pons operator.
        vm.expectRevert();
        router.sweepPool(poolId, 0);

        // The Pons operator bot sweeps every graduated pool (the same address does all of them on mainnet).
        // That credits the escrow for the router, and harvest() then pulls it and splits it.
        vm.prank(PONS_OPERATOR);
        IPonsHook(HOOK).sweepPoolFees(poolId, 1, 0);

        uint256 tBefore = treasury.balance;
        uint256 received = router.harvest();
        assertGt(received, 0, "post-graduation fees reached the router through the escrow");
        assertEq(vault.balanceOf(coin), (received * 80) / 100, "vault got 80%");
        assertEq(treasury.balance - tBefore, received - (received * 80) / 100, "treasury got the rest");
        assertEq(address(router).balance, 0, "nothing stuck in the router");
    }
}
