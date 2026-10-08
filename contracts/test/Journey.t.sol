// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launcher} from "../src/Launcher.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Vault} from "../src/Vault.sol";
import {RaffleDistributor} from "../src/RaffleDistributor.sol";
import {Drand} from "../src/Drand.sol";
import {VaultFactory, RouterFactory} from "../src/Factories.sol";
import {IPonsFactory, IPonsCurve} from "../src/interfaces/IPons.sol";
import {
    ISeaport,
    Order,
    OrderParameters,
    OrderComponents,
    OfferItem,
    ConsiderationItem,
    ItemType,
    OrderType
} from "../src/interfaces/ISeaport.sol";
import {DrandVectors} from "./DrandVectors.sol";
import {MockNft} from "./Vault.t.sol";

interface IERC20Balance {
    function balanceOf(address who) external view returns (uint256);
}

/// @notice The whole product in one test, against the live Pons factory, escrow and Seaport 1.6 on a fork:
///         launch a coin, trade it, harvest the fees, let the vault buy an NFT, release it to the raffle,
///         verify a real drand beacon on-chain and deliver the NFT to the winning holder.
///         Skipped unless ROBINHOOD_RPC_URL is set.
contract JourneyForkTest is Test {
    address constant FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    address constant HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");
    address feeRecipient = makeAddr("marketplaceFee");
    address seller;
    uint256 sellerKey;

    function test_fullJourney() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        (seller, sellerKey) = makeAddrAndKey("seller");

        // ---- deploy the system, wired exactly as in production
        MockNft nft = new MockNft(); // stands in for a real collection
        CollectionRegistry registry = new CollectionRegistry(owner);
        RaffleDistributor distributor = new RaffleDistributor(address(registry));
        Launcher launcher = new Launcher(
            FACTORY,
            address(registry),
            SEAPORT,
            address(distributor),
            ESCROW,
            HOOK,
            treasury,
            address(new VaultFactory()),
            address(new RouterFactory()),
            10 ether,
            5 ether
        );
        vm.startPrank(owner);
        registry.setLauncher(address(launcher));
        registry.setKeeper(keeper);
        registry.addCollection(address(nft));
        vm.stopPrank();

        // ---- 1. a creator launches an Airdrop coin that sweeps the collection
        Launcher.LaunchInput memory input;
        input.name = "Journey";
        input.symbol = "JRNY";
        input.logo = "https://example.com/logo.png";
        input.description = "end to end";
        input.collection = address(nft);
        input.policy = Vault.Policy.Airdrop;
        input.creatorTaxBps = 100;
        input.salt = "journey";
        vm.deal(creator, 1 ether);
        uint256 launchFee = IPonsFactory(FACTORY).launchFee();
        vm.prank(creator);
        (address coin, address curve, address routerAddr) = launcher.launch{value: launchFee}(input);
        Vault vault = Vault(payable(launcher.coinInfo(coin).vault));

        // ---- 2. someone trades the coin; the fees are harvested and split 80/20
        vm.warp(block.timestamp + 60);
        vm.deal(trader, 5 ether);
        vm.prank(trader);
        IPonsCurve(curve).buy{value: 1 ether}(1 ether, 0, trader);
        uint256 traderBalance = IERC20Balance(coin).balanceOf(trader);
        assertGt(traderBalance, 0, "trader holds the coin");

        FeeRouter(payable(routerAddr)).harvest();
        assertApproxEqAbs(vault.balanceOf(coin), 0.0136 ether, 1e9, "80% reached the vault");
        assertApproxEqAbs(treasury.balance, 0.0034 ether, 1e9, "20% reached the treasury");

        // ---- 3. the keeper posts a price cap; anyone makes the vault buy a listed NFT through real Seaport
        nft.mint(seller, 5);
        vm.prank(seller);
        nft.setApprovalForAll(SEAPORT, true);
        Order memory order = _signedListing(nft, 5, 0.009 ether, 0.001 ether);

        vm.prank(keeper);
        vault.postCap(0.05 ether);
        vm.prank(keeper);
        vault.buy(order, coin);
        assertEq(nft.ownerOf(5), address(vault), "the vault bought the NFT");
        assertApproxEqAbs(vault.balanceOf(coin), 0.0036 ether, 1e9, "0.0136 minus the 0.01 ETH price, charged to this coin only");

        // ---- 4. release it to the raffle (the coin's policy is Airdrop)
        vault.release(5);
        assertEq(nft.ownerOf(5), address(distributor));
        uint256 raffleId = distributor.raffleCount();
        assertEq(uint8(distributor.raffle(raffleId).state), uint8(RaffleDistributor.State.Pending));

        // ---- 5. keeper snapshot: the trader is the only holder (the curve is excluded from the snapshot)
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(uint256(0), trader, uint256(0), traderBalance))));

        // Move to the time of a beacon we hold a real signature for. Only relative times matter to the raffle.
        uint256 requestAt = Drand.timeOf(DrandVectors.ROUND_A) - distributor.DRAW_DELAY();
        vm.warp(requestAt - distributor.CHALLENGE_WINDOW());
        vm.prank(keeper);
        distributor.postSnapshot(raffleId, leaf, traderBalance);

        // ---- 6. after the challenge window anyone pins a drand round, then submits its verified signature
        vm.warp(requestAt);
        distributor.requestDraw(raffleId);
        assertEq(distributor.raffle(raffleId).drawRound, DrandVectors.ROUND_A);

        vm.warp(Drand.timeOf(DrandVectors.ROUND_A) + 1);
        distributor.submitDraw(raffleId, DrandVectors.SIG_A);

        // ---- 7. anyone delivers the NFT; the winner does nothing
        distributor.settle(raffleId, 0, trader, 0, traderBalance, new bytes32[](0));
        assertEq(nft.ownerOf(5), trader, "the NFT reached the holder");
        assertEq(uint8(distributor.raffle(raffleId).state), uint8(RaffleDistributor.State.Settled));
    }

    function _signedListing(MockNft nft, uint256 tokenId, uint256 sellerAmount, uint256 feeAmount)
        internal
        view
        returns (Order memory o)
    {
        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(ItemType.ERC721, address(nft), tokenId, 1, 1);
        ConsiderationItem[] memory cons = new ConsiderationItem[](2);
        cons[0] = ConsiderationItem(ItemType.NATIVE, address(0), 0, sellerAmount, sellerAmount, payable(seller));
        cons[1] = ConsiderationItem(ItemType.NATIVE, address(0), 0, feeAmount, feeAmount, payable(feeRecipient));

        o.parameters = OrderParameters({
            offerer: seller,
            zone: address(0),
            offer: offer,
            consideration: cons,
            orderType: OrderType.FULL_OPEN,
            startTime: 0,
            endTime: type(uint256).max,
            zoneHash: bytes32(0),
            salt: tokenId,
            conduitKey: bytes32(0),
            totalOriginalConsiderationItems: 2
        });

        OrderComponents memory c = OrderComponents({
            offerer: seller,
            zone: address(0),
            offer: offer,
            consideration: cons,
            orderType: OrderType.FULL_OPEN,
            startTime: 0,
            endTime: type(uint256).max,
            zoneHash: bytes32(0),
            salt: tokenId,
            conduitKey: bytes32(0),
            counter: ISeaport(SEAPORT).getCounter(seller)
        });
        bytes32 orderHash = ISeaport(SEAPORT).getOrderHash(c);
        (, bytes32 domain,) = ISeaport(SEAPORT).information();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerKey, keccak256(abi.encodePacked("\x19\x01", domain, orderHash)));
        o.signature = abi.encodePacked(r, s, v);
    }

    receive() external payable {}
}
