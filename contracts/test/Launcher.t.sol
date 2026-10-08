// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Vault} from "../src/Vault.sol";
import {VaultFactory, RouterFactory} from "../src/Factories.sol";
import {IPonsFactory, IPonsCurve} from "../src/interfaces/IPons.sol";

/// @notice End-to-end tests against the live Pons factory, escrow and Seaport on a Robinhood Chain fork.
///         Skipped unless ROBINHOOD_RPC_URL is set.
contract LauncherForkTest is Test {
    address constant FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;
    address constant PONSGUY = 0x9d1497d448a75E7d1A055D74cFfA50BC15120845;
    address constant STONKBROKERS = 0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0;

    CollectionRegistry registry;
    Launcher launcher;
    VaultFactory vaultFactory;
    RouterFactory routerFactory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address treasury = makeAddr("treasury");
    address distributor = makeAddr("distributor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        registry = new CollectionRegistry(owner);
        vaultFactory = new VaultFactory();
        routerFactory = new RouterFactory();
        launcher = new Launcher(
            FACTORY,
            address(registry),
            SEAPORT,
            distributor,
            ESCROW,
            HOOK,
            treasury,
            address(vaultFactory),
            address(routerFactory),
            10 ether,
            5 ether
        );

        vm.startPrank(owner);
        registry.setLauncher(address(launcher));
        registry.setKeeper(keeper);
        registry.addCollection(PONSGUY);
        registry.addCollection(STONKBROKERS);
        vm.stopPrank();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _input(address collection, Vault.Policy policy, uint16 tax, bytes32 salt)
        internal
        pure
        returns (Launcher.LaunchInput memory i)
    {
        i.name = "Curato Coin";
        i.symbol = "CURA";
        i.logo = "https://example.com/logo.png";
        i.description = "launched through Curato";
        i.collection = collection;
        i.policy = policy;
        i.creatorTaxBps = tax;
        i.salt = salt;
    }

    function _launch(address who, address collection, Vault.Policy policy, uint16 tax, bytes32 salt)
        internal
        returns (address coin, address curve, address router)
    {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(who);
        return launcher.launch{value: fee}(_input(collection, policy, tax, salt));
    }

    // ---------------------------------------------------------------- the full journey

    function test_launchTradeHarvestEndToEnd() public {
        (address coin, address curve, address routerAddr) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 100, "a");

        Launcher.CoinInfo memory info = launcher.coinInfo(coin);
        assertEq(info.creator, alice);
        assertEq(info.curve, curve);
        assertEq(info.router, routerAddr);
        assertEq(info.collection, PONSGUY);
        assertEq(uint8(info.policy), uint8(Vault.Policy.Airdrop));
        assertEq(launcher.launchedCount(), 1);

        // wiring
        FeeRouter router = FeeRouter(payable(routerAddr));
        Vault vault = Vault(payable(info.vault));
        assertEq(router.coin(), coin);
        assertEq(router.curve(), curve);
        assertEq(router.vault(), address(vault));
        assertEq(router.treasury(), treasury);
        assertEq(registry.vaultOf(PONSGUY), address(vault));
        assertEq(uint8(vault.policyOf(coin)), uint8(Vault.Policy.Airdrop));
        assertEq(vault.collection(), PONSGUY);

        // trade 1 ETH after the anti-snipe window, then harvest
        vm.warp(block.timestamp + 60);
        vm.prank(bob);
        IPonsCurve(curve).buy{value: 1 ether}(1 ether, 0, bob);

        router.harvest();

        assertApproxEqAbs(vault.balanceOf(coin), 0.0136 ether, 1e9, "80% credited to this coin in the vault");
        assertApproxEqAbs(treasury.balance, 0.0034 ether, 1e9, "20% to the treasury");
        assertEq(address(router).balance, 0);
    }

    function test_secondCoinOnSameCollectionSharesTheVaultButNotTheBalance() public {
        (address coinA,,) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "a");
        (address coinB,,) = _launch(bob, PONSGUY, Vault.Policy.Burn, 0, "b");

        address vaultA = launcher.coinInfo(coinA).vault;
        address vaultB = launcher.coinInfo(coinB).vault;
        assertEq(vaultA, vaultB, "one vault per collection");
        assertTrue(launcher.coinInfo(coinA).router != launcher.coinInfo(coinB).router, "one router per coin");

        assertEq(uint8(Vault(payable(vaultA)).policyOf(coinA)), uint8(Vault.Policy.Airdrop));
        assertEq(uint8(Vault(payable(vaultA)).policyOf(coinB)), uint8(Vault.Policy.Burn));
        assertEq(launcher.launchedCount(), 2);
    }

    function test_differentCollectionsGetDifferentVaults() public {
        (address coinA,,) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "a");
        (address coinB,,) = _launch(alice, STONKBROKERS, Vault.Policy.Airdrop, 0, "a");
        assertTrue(launcher.coinInfo(coinA).vault != launcher.coinInfo(coinB).vault);
    }

    function test_theSameSaltFromDifferentCreatorsDoesNotCollide() public {
        _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "same");
        _launch(bob, PONSGUY, Vault.Policy.Airdrop, 0, "same");
        assertEq(launcher.launchedCount(), 2);
    }

    // ---------------------------------------------------------------- size

    /// @dev Chains reject contracts above 24,576 bytes (EIP-170); `forge test` does not enforce it.
    function test_everyDeployedContractFitsTheSizeLimit() public {
        (address coin,,) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "size");
        Launcher.CoinInfo memory info = launcher.coinInfo(coin);

        assertLe(address(launcher).code.length, 24_576, "Launcher");
        assertLe(address(vaultFactory).code.length, 24_576, "VaultFactory");
        assertLe(address(routerFactory).code.length, 24_576, "RouterFactory");
        assertLe(address(registry).code.length, 24_576, "CollectionRegistry");
        assertLe(info.vault.code.length, 24_576, "Vault");
        assertLe(info.router.code.length, 24_576, "FeeRouter");
    }

    // ---------------------------------------------------------------- guards

    function test_rejectsUnlistedCollection() public {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(alice);
        vm.expectRevert(Launcher.NotListed.selector);
        launcher.launch{value: fee}(_input(makeAddr("random"), Vault.Policy.Airdrop, 0, "x"));
    }

    function test_rejectsDelistedCollection() public {
        vm.prank(owner);
        registry.delistCollection(PONSGUY);

        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(alice);
        vm.expectRevert(Launcher.NotListed.selector);
        launcher.launch{value: fee}(_input(PONSGUY, Vault.Policy.Airdrop, 0, "x"));
    }

    function test_rejectsNoPolicy() public {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(alice);
        vm.expectRevert(Launcher.WrongPolicy.selector);
        launcher.launch{value: fee}(_input(PONSGUY, Vault.Policy.None, 0, "x"));
    }

    function test_rejectsTaxAboveProtocolCap() public {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(alice);
        vm.expectRevert(Launcher.TaxTooHigh.selector);
        launcher.launch{value: fee}(_input(PONSGUY, Vault.Policy.Airdrop, 1001, "x"));
    }

    function test_acceptsTheMaximumTax() public {
        (address coin, address curve,) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 1000, "max");
        assertTrue(coin != address(0));
        assertEq(IPonsCurve(curve).creatorTaxBps(), 1000);
    }

    function test_rejectsTooLowLaunchFee() public {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        vm.prank(alice);
        vm.expectRevert(Launcher.LaunchFeeTooLow.selector);
        launcher.launch{value: fee - 1}(_input(PONSGUY, Vault.Policy.Airdrop, 0, "x"));
    }

    function test_refundsExcessEth() public {
        uint256 fee = IPonsFactory(FACTORY).launchFee();
        uint256 before = alice.balance;
        vm.prank(alice);
        launcher.launch{value: fee + 1 ether}(_input(PONSGUY, Vault.Policy.Airdrop, 0, "refund"));
        assertEq(before - alice.balance, fee, "only the launch fee is kept");
        assertEq(address(launcher).balance, 0, "launcher holds nothing");
    }

    function test_launcherNeverKeepsEth() public {
        _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "a");
        assertEq(address(launcher).balance, 0);
    }

    function test_launchedCoinCannotBeRewiredByAnyone() public {
        (address coin,, address routerAddr) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 0, "a");
        FeeRouter router = FeeRouter(payable(routerAddr));

        // the launcher cannot rebind, and neither can anyone else
        vm.expectRevert(FeeRouter.NotLauncher.selector);
        router.bind(coin, address(1));
        vm.prank(address(launcher));
        vm.expectRevert(FeeRouter.AlreadyBound.selector);
        router.bind(coin, address(1));

        // the vault cannot be re-registered either
        Vault vault = Vault(payable(launcher.coinInfo(coin).vault));
        vm.prank(address(launcher));
        vm.expectRevert(Vault.AlreadyRegistered.selector);
        vault.registerCoin(coin, Vault.Policy.Burn);
    }

    // ---------------------------------------------------------------- graduation

    function test_harvestStillWorksAfterTheCoinGraduates() public {
        (address coin, address curve, address routerAddr) = _launch(alice, PONSGUY, Vault.Policy.Airdrop, 100, "grad");
        FeeRouter router = FeeRouter(payable(routerAddr));
        Vault vault = Vault(payable(launcher.coinInfo(coin).vault));

        vm.warp(block.timestamp + 60);
        address whale = makeAddr("whale");
        vm.deal(whale, 100 ether);

        // keep buying until the curve has sold out, which is when the coin graduates
        for (uint256 i = 0; i < 20 && IPonsCurveGrad(curve).sellableTokens() > 0; i++) {
            vm.prank(whale);
            try IPonsCurve(curve).buy{value: 2 ether}(2 ether, 0, whale) {} catch { break; }
        }
        assertEq(IPonsCurveGrad(curve).sellableTokens(), 0, "the curve sold out, so the coin graduated");

        uint256 received = router.harvest();
        assertGt(received, 0, "fees accrued on the curve are still harvestable after graduation");
        assertEq(vault.balanceOf(coin) + treasury.balance, received, "every wei is split");
        assertApproxEqRel(vault.balanceOf(coin), (received * 80) / 100, 1e12, "still 80/20");
        assertEq(address(router).balance, 0);
    }

    receive() external payable {}
}

interface IPonsCurveGrad {
    function sellableTokens() external view returns (uint256);
}
