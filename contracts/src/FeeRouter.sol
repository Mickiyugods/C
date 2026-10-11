// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPonsCurve, IPonsHook, IFeeEscrow} from "./interfaces/IPons.sol";

interface IVaultDeposit {
    /// @notice Credit `coin` with the ETH sent along.
    function deposit(address coin) external payable;
}

/// @title FeeRouter
/// @notice One per coin. It is the coin's Pons `creatorFeeRecipient`: it pulls the creator fees out of
///         Pons, then splits every wei 80% to the collection vault and 20% to the treasury.
/// @dev No owner, no admin, no upgrade path. The split, vault, treasury and escrow are immutable and the
///      coin and curve are bound exactly once by the Launcher. `harvest()` can be called by anyone.
contract FeeRouter {
    uint256 public constant VAULT_BPS = 8_000;
    uint256 public constant BPS = 10_000;

    address public immutable launcher;
    address public immutable vault;
    address public immutable treasury;
    IFeeEscrow public immutable escrow;
    IPonsHook public immutable hook;

    address public coin;
    address public curve;

    /// @notice Treasury share that could not be pushed (for example a treasury that rejects ETH).
    uint256 public treasuryPending;
    /// @notice Vault share that could not be pushed (for example the coin was somehow never registered
    ///         on the vault). Kept here instead of reverting the whole harvest, so the treasury's 20%
    ///         and whatever else called harvest() in the same batch are never held hostage by this.
    uint256 public vaultPending;

    uint256 private _lock = 1;

    event Bound(address indexed coin, address indexed curve);
    event Harvested(uint256 received, uint256 toVault, uint256 toTreasury);
    event TreasuryPaid(uint256 amount);
    event TreasuryDeferred(uint256 amount);
    event VaultPaid(uint256 amount);
    event VaultDeferred(uint256 amount);

    error NotLauncher();
    error AlreadyBound();
    error NotBound();
    error ZeroAddress();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address launcher_, address vault_, address treasury_, address escrow_, address hook_) {
        if (launcher_ == address(0) || vault_ == address(0) || treasury_ == address(0) || escrow_ == address(0)) {
            revert ZeroAddress();
        }
        launcher = launcher_;
        vault = vault_;
        treasury = treasury_;
        escrow = IFeeEscrow(escrow_);
        hook = IPonsHook(hook_);
    }

    /// @notice Called once by the Launcher right after the coin is created.
    function bind(address coin_, address curve_) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (coin != address(0)) revert AlreadyBound();
        if (coin_ == address(0) || curve_ == address(0)) revert ZeroAddress();
        coin = coin_;
        curve = curve_;
        emit Bound(coin_, curve_);
    }

    /// @notice Pull whatever Pons owes this router and split it. Anyone may call.
    /// @dev Works on the amount received in this call, so ETH sent here by hand is not treated as
    ///      trading fees; it just stays in the contract.
    function harvest() external nonReentrant returns (uint256 received) {
        if (coin == address(0)) revert NotBound();

        // Move pending fees from the curve into the escrow. The curve only lets its creator do this,
        // and the creator is this router. It is skipped (not fatal) if the curve has nothing to sweep.
        try IPonsCurve(curve).sweepFees(0) {} catch {}

        received = _claimFromEscrow();
        _split(received);
    }

    /// @notice After graduation, fees accrue on the Uniswap v4 hook and are swept per pool.
    /// @dev On the live hook this reverts (InternalSwapRequiresOperator) while coin-denominated fees are
    ///      pending, because converting them is reserved to the Pons fee-sweep operator. In practice the
    ///      operator sweeps and credits the escrow, and `harvest()` then collects it (tested on a fork).
    ///      Kept for the cases where the hook lets the creator sweep; buyback is always off.
    function sweepPool(bytes32 poolId, uint256 minConversionQuoteOut) external nonReentrant returns (uint256 received) {
        if (coin == address(0)) revert NotBound();
        hook.sweepPoolFees(poolId, minConversionQuoteOut, 0);
        received = _claimFromEscrow();
        _split(received);
    }

    /// @notice Send any treasury share that earlier failed to go through. Anyone may call.
    function flushTreasury() external nonReentrant {
        uint256 amount = treasuryPending;
        if (amount == 0) return;
        treasuryPending = 0;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) {
            treasuryPending = amount;
            emit TreasuryDeferred(amount);
        } else {
            emit TreasuryPaid(amount);
        }
    }

    /// @notice Retry any vault share that earlier failed to go through. Anyone may call.
    function flushVault() external nonReentrant {
        uint256 amount = vaultPending;
        if (amount == 0) return;
        vaultPending = 0;
        try IVaultDeposit(vault).deposit{value: amount}(coin) {
            emit VaultPaid(amount);
        } catch {
            vaultPending = amount;
            emit VaultDeferred(amount);
        }
    }

    receive() external payable {}

    // ------------------------------------------------------------------ internal

    function _claimFromEscrow() private returns (uint256 received) {
        if (escrow.balanceOf(address(this)) == 0) return 0;
        uint256 before = address(this).balance;
        escrow.claim();
        received = address(this).balance - before;
    }

    function _split(uint256 received) private {
        if (received == 0) return;

        uint256 toVault = (received * VAULT_BPS) / BPS;
        uint256 toTreasury = received - toVault; // rounding dust goes to the treasury

        try IVaultDeposit(vault).deposit{value: toVault}(coin) {
            emit VaultPaid(toVault);
        } catch {
            vaultPending += toVault;
            emit VaultDeferred(toVault);
        }

        (bool ok,) = treasury.call{value: toTreasury}("");
        if (ok) {
            emit TreasuryPaid(toTreasury);
        } else {
            treasuryPending += toTreasury;
            emit TreasuryDeferred(toTreasury);
        }

        emit Harvested(received, toVault, toTreasury);
    }
}
