// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {IPonsFactory, IPonsCurve} from "../src/interfaces/IPons.sol";

// ----------------------------------------------------------------------------- mocks

contract MockEscrow {
    mapping(address => uint256) public balanceOf;

    function credit(address who) external payable {
        balanceOf[who] += msg.value;
    }

    function claim() external {
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "claim failed");
    }
}

contract MockCurve {
    MockEscrow public escrow;
    address public creator;
    uint256 public pending;
    bool public shouldRevert;

    constructor(MockEscrow e, address creator_) {
        escrow = e;
        creator = creator_;
    }

    function setPending(uint256 amount) external payable {
        pending = amount;
        require(msg.value == amount, "fund the pending fees");
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function sweepFees(uint256) external {
        require(!shouldRevert, "nothing to sweep");
        require(msg.sender == creator, "only creator");
        uint256 amount = pending;
        pending = 0;
        if (amount > 0) escrow.credit{value: amount}(creator);
    }
}

contract MockVault {
    mapping(address => uint256) public credited;
    uint256 public total;

    function deposit(address coin) external payable {
        credited[coin] += msg.value;
        total += msg.value;
    }
}

contract ReentrantVault {
    FeeRouter public router;

    function setRouter(FeeRouter r) external {
        router = r;
    }

    function deposit(address) external payable {
        router.harvest(); // must revert: the router is mid-harvest
    }
}

contract RejectingTreasury {
    receive() external payable {
        revert("no thanks");
    }
}

contract RejectingVault {
    function deposit(address) external payable {
        revert("no thanks");
    }
}

contract AcceptingTreasury {
    receive() external payable {}
}

// ----------------------------------------------------------------------------- unit tests

contract FeeRouterTest is Test {
    MockEscrow escrow;
    MockVault vault;
    MockCurve curve;
    FeeRouter router;
    address treasury = makeAddr("treasury");
    address coin = makeAddr("coin");
    address launcher = address(this);

    function setUp() public {
        escrow = new MockEscrow();
        vault = new MockVault();
        router = new FeeRouter(launcher, address(vault), treasury, address(escrow), makeAddr("hook"));
        curve = new MockCurve(escrow, address(router));
        router.bind(coin, address(curve));
    }

    function _fund(uint256 amount) internal {
        vm.deal(address(this), amount);
        curve.setPending{value: amount}(amount);
    }

    // ---- wiring

    function test_constantsAreEightyTwenty() public view {
        assertEq(router.VAULT_BPS(), 8_000);
        assertEq(router.BPS(), 10_000);
    }

    function test_bindOnlyByLauncherAndOnlyOnce() public {
        FeeRouter fresh = new FeeRouter(launcher, address(vault), treasury, address(escrow), address(1));

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(FeeRouter.NotLauncher.selector);
        fresh.bind(coin, address(curve));

        fresh.bind(coin, address(curve));
        vm.expectRevert(FeeRouter.AlreadyBound.selector);
        fresh.bind(coin, address(curve));
    }

    function test_bindRejectsZero() public {
        FeeRouter fresh = new FeeRouter(launcher, address(vault), treasury, address(escrow), address(1));
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        fresh.bind(address(0), address(curve));
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(launcher, address(0), treasury, address(escrow), address(1));
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(launcher, address(vault), address(0), address(escrow), address(1));
    }

    function test_harvestBeforeBindReverts() public {
        FeeRouter fresh = new FeeRouter(launcher, address(vault), treasury, address(escrow), address(1));
        vm.expectRevert(FeeRouter.NotBound.selector);
        fresh.harvest();
    }

    // ---- the split

    function test_harvestSplitsEightyTwenty() public {
        _fund(0.017 ether);

        vm.prank(makeAddr("anyone"));
        uint256 received = router.harvest();

        assertEq(received, 0.017 ether);
        assertEq(vault.credited(coin), 0.0136 ether, "80% to the vault, credited to this coin");
        assertEq(treasury.balance, 0.0034 ether, "20% to the treasury");
        assertEq(address(router).balance, 0, "router keeps nothing");
    }

    function testFuzz_splitIsExactAndNothingIsKept(uint96 amount) public {
        amount = uint96(bound(amount, 1, 1_000_000 ether));
        _fund(amount);

        router.harvest();

        assertEq(vault.credited(coin) + treasury.balance, amount, "every wei is accounted for");
        assertEq(vault.credited(coin), (uint256(amount) * 8_000) / 10_000);
        assertEq(address(router).balance, 0);
    }

    function test_roundingDustGoesToTreasury() public {
        _fund(3); // 80% of 3 = 2.4 -> vault 2, treasury 1
        router.harvest();
        assertEq(vault.credited(coin), 2);
        assertEq(treasury.balance, 1);
    }

    function test_harvestWithNothingIsHarmless() public {
        uint256 received = router.harvest();
        assertEq(received, 0);
        assertEq(vault.total(), 0);
        assertEq(treasury.balance, 0);
    }

    function test_harvestSurvivesCurveThatCannotSweep() public {
        _fund(0.01 ether);
        router.harvest(); // sweeps and pays
        curve.setRevert(true);

        // The curve now reverts on sweep, but whatever is already in the escrow still flows.
        vm.deal(address(this), 1 ether);
        escrow.credit{value: 1 ether}(address(router));
        uint256 received = router.harvest();
        assertEq(received, 1 ether);
        assertEq(vault.credited(coin), 0.01 ether * 8 / 10 + 0.8 ether);
    }

    function test_directEthIsNotTreatedAsFees() public {
        vm.deal(address(this), 5 ether);
        (bool ok,) = address(router).call{value: 5 ether}("");
        assertTrue(ok);

        uint256 received = router.harvest();
        assertEq(received, 0, "ETH sent by hand is not trading fees");
        assertEq(vault.total(), 0);
        assertEq(address(router).balance, 5 ether);
    }

    // ---- treasury failure must never block the vault

    function test_rejectingTreasuryDoesNotBlockVault() public {
        RejectingTreasury bad = new RejectingTreasury();
        FeeRouter r = new FeeRouter(launcher, address(vault), address(bad), address(escrow), address(1));
        MockCurve c = new MockCurve(escrow, address(r));
        r.bind(coin, address(c));

        vm.deal(address(this), 1 ether);
        c.setPending{value: 1 ether}(1 ether);
        r.harvest();

        assertEq(vault.credited(coin), 0.8 ether, "vault still paid");
        assertEq(r.treasuryPending(), 0.2 ether, "treasury share is parked, not lost");
        assertEq(address(r).balance, 0.2 ether);

        r.flushTreasury(); // still rejecting: stays parked
        assertEq(r.treasuryPending(), 0.2 ether);
    }

    function test_flushTreasuryPaysOnceItRecovers() public {
        AcceptingTreasury good = new AcceptingTreasury();
        FeeRouter r = new FeeRouter(launcher, address(vault), address(good), address(escrow), address(1));
        MockCurve c = new MockCurve(escrow, address(r));
        r.bind(coin, address(c));

        vm.deal(address(r), 0.5 ether); // simulate a parked amount via state
        vm.store(address(r), bytes32(uint256(2)), bytes32(uint256(0.5 ether)));
        // slot layout: coin(0) curve(1) treasuryPending(2)
        assertEq(r.treasuryPending(), 0.5 ether);

        r.flushTreasury();
        assertEq(address(good).balance, 0.5 ether);
        assertEq(r.treasuryPending(), 0);
    }

    // ---- a broken vault must never block the treasury, and must be retryable

    function test_rejectingVaultDoesNotBlockTreasury() public {
        RejectingVault bad = new RejectingVault();
        FeeRouter r = new FeeRouter(launcher, address(bad), treasury, address(escrow), address(1));
        MockCurve c = new MockCurve(escrow, address(r));
        r.bind(coin, address(c));

        vm.deal(address(this), 1 ether);
        c.setPending{value: 1 ether}(1 ether);
        r.harvest();

        assertEq(treasury.balance, 0.2 ether, "treasury still paid");
        assertEq(r.vaultPending(), 0.8 ether, "vault share is parked, not lost");
        assertEq(address(r).balance, 0.8 ether);

        r.flushVault(); // still rejecting: stays parked
        assertEq(r.vaultPending(), 0.8 ether);
    }

    function test_flushVaultPaysOnceItRecovers() public {
        FeeRouter r = new FeeRouter(launcher, address(vault), treasury, address(escrow), address(1));
        MockCurve c = new MockCurve(escrow, address(r));
        r.bind(coin, address(c));

        vm.deal(address(r), 0.5 ether); // simulate a parked amount via state
        vm.store(address(r), bytes32(uint256(3)), bytes32(uint256(0.5 ether)));
        // slot layout: coin(0) curve(1) treasuryPending(2) vaultPending(3)
        assertEq(r.vaultPending(), 0.5 ether);

        r.flushVault();
        assertEq(vault.credited(coin), 0.5 ether);
        assertEq(r.vaultPending(), 0);
    }

    // ---- reentrancy

    /// @notice A vault that tries to reenter harvest() from inside deposit() must still be blocked by the
    ///         nonReentrant lock. Since the vault leg is now try/catch'd (so a broken or hostile vault can't
    ///         hold the treasury's share hostage), the *whole* harvest() no longer reverts — instead the
    ///         blocked deposit is caught and deferred to vaultPending, and the treasury is still paid.
    function test_reentrancyIsBlocked() public {
        ReentrantVault rv = new ReentrantVault();
        FeeRouter r = new FeeRouter(launcher, address(rv), treasury, address(escrow), address(1));
        rv.setRouter(r);
        MockCurve c = new MockCurve(escrow, address(r));
        r.bind(coin, address(c));

        vm.deal(address(this), 1 ether);
        c.setPending{value: 1 ether}(1 ether);

        r.harvest(); // does not revert: the reentrant inner call is the one that fails

        assertEq(r.vaultPending(), 0.8 ether, "blocked reentrant deposit must be deferred, not lost or silently dropped");
        assertEq(treasury.balance, 0.2 ether, "treasury must still be paid even though the vault leg was blocked");
    }

    receive() external payable {}
}

// ----------------------------------------------------------------------------- fork test

/// @notice Launches a real coin through the live Pons factory on a fork, trades it, and checks that the
///         router splits the real fees 80/20. Skipped unless ROBINHOOD_RPC_URL is set.
contract FeeRouterForkTest is Test {
    IPonsFactory constant FACTORY = IPonsFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address constant ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;

    function test_realLaunchAndHarvest() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        MockVault vault = new MockVault();
        address treasury = makeAddr("treasury");
        FeeRouter router = new FeeRouter(address(this), address(vault), treasury, ESCROW, HOOK);

        IPonsFactory.TokenParams memory p;
        p.name = "Curato Test";
        p.symbol = "CTEST";
        p.logo = "https://example.com/logo.png";
        p.description = "fork test";
        p.creatorFeeRecipient = address(router);
        p.creatorTaxBps = 100; // 1%
        p.buybackEnabled = false;
        p.expectedEconomics = FACTORY.previewLaunchEconomics(0, address(0));
        p.salt = keccak256("curato-fork-test");

        uint256 fee = FACTORY.launchFee();
        (address token, address curve) = FACTORY.launchToken{value: fee}(p, 0, address(0));
        router.bind(token, curve);

        vm.warp(block.timestamp + 60); // past the 5 second anti-snipe window
        address buyer = makeAddr("buyer");
        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        IPonsCurve(curve).buy{value: 1 ether}(1 ether, 0, buyer);

        uint256 received = router.harvest();

        // 1 ETH traded, 1% curve fee (70% to the creator side) + 1% creator tax = 0.017 ETH.
        assertApproxEqAbs(received, 0.017 ether, 1e9, "creator side receives 0.017 ETH");
        assertApproxEqAbs(vault.credited(token), 0.0136 ether, 1e9, "vault gets 80%");
        assertApproxEqAbs(treasury.balance, 0.0034 ether, 1e9, "treasury gets 20%");
        assertEq(address(router).balance, 0, "router keeps nothing");
    }

    receive() external payable {}
}
