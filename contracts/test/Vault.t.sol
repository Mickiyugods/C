// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
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

// ----------------------------------------------------------------------------- mocks

contract MockNft {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd || id == 0x01ffc9a7;
    }

    function mint(address to, uint256 id) external {
        ownerOf[id] = to;
    }

    function setApprovalForAll(address op, bool ok) external {
        isApprovedForAll[msg.sender][op] = ok;
    }

    function transferFrom(address from, address to, uint256 id) public {
        require(ownerOf[id] == from, "not owner");
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "not approved");
        ownerOf[id] = to;
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) external {
        transferFrom(from, to, id);
        if (to.code.length > 0) {
            (bool ok, bytes memory ret) = to.call(
                abi.encodeWithSignature("onERC721Received(address,address,uint256,bytes)", msg.sender, from, id, data)
            );
            require(ok && ret.length >= 4 && bytes4(ret) == 0x150b7a02, "receiver rejected");
        }
    }
}

contract MockSeaport {
    /// 0 = honest, 1 = does not deliver the NFT, 3 = takes the ETH and reverts
    uint256 public mode;

    function setMode(uint256 m) external {
        mode = m;
    }

    function fulfillOrder(Order calldata order, bytes32) external payable returns (bool) {
        OrderParameters calldata p = order.parameters;
        uint256 total;
        for (uint256 i = 0; i < p.consideration.length; i++) {
            total += p.consideration[i].startAmount;
            (bool ok,) = p.consideration[i].recipient.call{value: p.consideration[i].startAmount}("");
            require(ok, "pay failed");
        }
        require(msg.value == total, "wrong value");
        if (mode == 3) revert("seaport reverted");
        if (mode != 1) MockNft(p.offer[0].token).transferFrom(p.offerer, msg.sender, p.offer[0].identifierOrCriteria);
        return true;
    }

    receive() external payable {}
}

contract RefundingSeaport {
    /// Pays the seller 1 wei less than it was sent and returns the difference to the caller.
    function fulfillOrder(Order calldata order, bytes32) external payable returns (bool) {
        OrderParameters calldata p = order.parameters;
        MockNft(p.offer[0].token).transferFrom(p.offerer, msg.sender, p.offer[0].identifierOrCriteria);
        (bool ok,) = msg.sender.call{value: 1}("");
        require(ok, "refund failed");
        return true;
    }

    receive() external payable {}
}

contract MockDistributor {
    uint256 public lastId;
    address public lastCoin;
    uint256 public received;

    function onERC721Received(address, address, uint256 id, bytes calldata data) external returns (bytes4) {
        lastId = id;
        lastCoin = abi.decode(data, (address));
        received++;
        return 0x150b7a02;
    }
}

// ----------------------------------------------------------------------------- helpers

abstract contract VaultBase is Test {
    CollectionRegistry registry;
    Vault vault;
    MockNft nft;
    MockSeaport seaport;
    MockDistributor distributor;

    address owner = makeAddr("owner");
    address launcher = makeAddr("launcher");
    address keeper = makeAddr("keeper");
    address seller = makeAddr("seller");
    address feeRecipient = makeAddr("feeRecipient");
    address coinA = makeAddr("coinA"); // airdrop
    address coinB = makeAddr("coinB"); // burn

    uint256 constant HARD_MAX = 10 ether;
    uint256 constant DAILY = 5 ether;

    function _deploy(address seaportAddr) internal {
        registry = new CollectionRegistry(owner);
        nft = new MockNft();
        distributor = new MockDistributor();
        vault = new Vault(address(nft), address(registry), seaportAddr, address(distributor), launcher, HARD_MAX, DAILY);

        vm.prank(owner);
        registry.setKeeper(keeper);

        vm.startPrank(launcher);
        vault.registerCoin(coinA, Vault.Policy.Airdrop);
        vault.registerCoin(coinB, Vault.Policy.Burn);
        vm.stopPrank();
    }

    function _order(uint256 tokenId, uint256 sellerAmount, uint256 feeAmount) internal view returns (Order memory o) {
        OfferItem[] memory offer = new OfferItem[](1);
        offer[0] = OfferItem(ItemType.ERC721, address(nft), tokenId, 1, 1);

        uint256 n = feeAmount > 0 ? 2 : 1;
        ConsiderationItem[] memory cons = new ConsiderationItem[](n);
        cons[0] = ConsiderationItem(ItemType.NATIVE, address(0), 0, sellerAmount, sellerAmount, payable(seller));
        if (feeAmount > 0) {
            cons[1] = ConsiderationItem(ItemType.NATIVE, address(0), 0, feeAmount, feeAmount, payable(feeRecipient));
        }

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
            totalOriginalConsiderationItems: n
        });
        o.signature = "";
    }

    /// The keeper is the only account allowed to buy.
    function _buy(Order memory order, address coin) internal returns (uint256 id, uint256 price) {
        vm.prank(keeper);
        return vault.buy(order, coin);
    }

    function _postCap(uint256 amount) internal {
        vm.prank(keeper);
        vault.postCap(amount);
    }

    function _fund(address coin, uint256 amount) internal {
        vm.deal(address(this), amount);
        vault.deposit{value: amount}(coin);
    }

    receive() external payable {}
}

// ----------------------------------------------------------------------------- unit tests

contract VaultTest is VaultBase {
    function setUp() public {
        seaport = new MockSeaport();
        _deploy(address(seaport));
        nft.mint(seller, 1);
        nft.mint(seller, 2);
        nft.mint(seller, 3);
        vm.prank(seller);
        nft.setApprovalForAll(address(seaport), true);
    }

    // ---- coins and deposits

    function test_registerCoinOnlyLauncherOnce() public {
        address c = makeAddr("newCoin");
        vm.expectRevert(Vault.NotLauncher.selector);
        vault.registerCoin(c, Vault.Policy.Burn);

        vm.startPrank(launcher);
        vault.registerCoin(c, Vault.Policy.Burn);
        vm.expectRevert(Vault.AlreadyRegistered.selector);
        vault.registerCoin(c, Vault.Policy.Airdrop);
        vm.expectRevert(Vault.WrongPolicy.selector);
        vault.registerCoin(makeAddr("x"), Vault.Policy.None);
        vm.stopPrank();
    }

    function test_depositCreditsTheCoin() public {
        _fund(coinA, 1 ether);
        assertEq(vault.balanceOf(coinA), 1 ether);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_depositRejectsUnknownCoinAndZero() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(Vault.UnknownCoin.selector);
        vault.deposit{value: 1 ether}(makeAddr("nobody"));
        vm.expectRevert(Vault.ZeroAmount.selector);
        vault.deposit(coinA);
    }

    // ---- keeper and cap

    function test_onlyKeeperPostsCap() public {
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.postCap(1 ether);

        vm.prank(owner); // not even the registry owner
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.postCap(1 ether);

        _postCap(1 ether);
        assertEq(vault.cap(), 1 ether);
    }

    function test_noKeeperMeansNoCap() public {
        vm.prank(owner);
        registry.setKeeper(address(0));
        vm.prank(address(0));
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.postCap(1 ether);
    }

    function test_capCannotExceedCeilingOrBeZero() public {
        vm.startPrank(keeper);
        vm.expectRevert(Vault.CapAboveCeiling.selector);
        vault.postCap(HARD_MAX + 1);
        vm.expectRevert(Vault.CapAboveCeiling.selector);
        vault.postCap(0);
        vm.stopPrank();
    }

    function test_capRaiseIsLimitedInSizeAndRate() public {
        _postCap(1 ether);

        vm.startPrank(keeper);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(Vault.CapRaiseTooLarge.selector);
        vault.postCap(1.11 ether); // more than +10%

        vault.postCap(1.1 ether); // exactly +10% is fine
        assertEq(vault.cap(), 1.1 ether);

        vm.expectRevert(Vault.CapRaiseTooSoon.selector);
        vault.postCap(1.2 ether); // within the hour
        vm.stopPrank();
    }

    function test_capCanBeLoweredAtAnyTime() public {
        _postCap(2 ether);
        vm.startPrank(keeper);
        vault.postCap(0.5 ether);
        vault.postCap(0.1 ether);
        vm.stopPrank();
        assertEq(vault.cap(), 0.1 ether);
    }

    // ---- buying

    function test_buyHappyPath() public {
        _fund(coinA, 2 ether);
        _postCap(1 ether);

        uint256 sellerBefore = seller.balance;
        (uint256 id, uint256 price) = _buy(_order(1, 0.9 ether, 0.05 ether), coinA);

        assertEq(id, 1);
        assertEq(price, 0.95 ether);
        assertEq(nft.ownerOf(1), address(vault));
        assertEq(vault.coinOfNft(1), coinA);
        assertEq(vault.balanceOf(coinA), 1.05 ether, "charged to coinA only");
        assertEq(seller.balance - sellerBefore, 0.9 ether);
        assertEq(feeRecipient.balance, 0.05 ether, "fees paid to every recipient");
        assertEq(address(vault).balance, 1.05 ether);
    }

    function test_onlyTheKeeperCanBuy() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);

        // A seller who lists at exactly the cap must not be able to sell to the vault themselves.
        vm.prank(seller);
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.buy(_order(1, 0.5 ether, 0), coinA);

        vm.prank(makeAddr("randomCaller"));
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.buy(_order(1, 0.5 ether, 0), coinA);

        vm.prank(owner); // not even the registry owner
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.buy(_order(1, 0.5 ether, 0), coinA);

        _buy(_order(1, 0.5 ether, 0), coinA);
        assertEq(nft.ownerOf(1), address(vault));
    }

    function test_noKeeperMeansNoBuying() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        vm.prank(owner);
        registry.setKeeper(address(0));
        vm.prank(address(0));
        vm.expectRevert(Vault.NotKeeper.selector);
        vault.buy(_order(1, 0.5 ether, 0), coinA);
    }

    function test_cannotBuyAboveCap() public {
        _fund(coinA, 5 ether);
        _postCap(1 ether);
        vm.expectRevert(Vault.AboveCap.selector);
        _buy(_order(1, 1 ether, 1), coinA);
    }

    function test_cannotSpendMoreThanTheCoinHolds() public {
        _fund(coinA, 0.4 ether);
        _fund(coinB, 5 ether); // plenty in the vault overall, but not coinA's
        _postCap(1 ether);
        vm.expectRevert(Vault.InsufficientCoinBalance.selector);
        _buy(_order(1, 0.5 ether, 0), coinA);
    }

    function test_coinsNeverPoolFunds() public {
        _fund(coinA, 0.4 ether);
        _fund(coinB, 0.4 ether);
        _postCap(1 ether);
        // 0.6 ETH would only fit if the two balances were pooled
        vm.expectRevert(Vault.InsufficientCoinBalance.selector);
        _buy(_order(1, 0.6 ether, 0), coinA);
    }

    function test_cannotBuyWithoutCapOrWithStaleCap() public {
        _fund(coinA, 1 ether);
        vm.expectRevert(Vault.CapStale.selector);
        _buy(_order(1, 0.1 ether, 0), coinA);

        _postCap(1 ether);
        vm.warp(block.timestamp + 2 days + 1);
        vm.expectRevert(Vault.CapStale.selector);
        _buy(_order(1, 0.1 ether, 0), coinA);

        _postCap(0.5 ether); // re-posting makes it fresh again (lowering is always allowed)
        _buy(_order(1, 0.1 ether, 0), coinA);
    }

    function test_unknownCoinCannotBeCharged() public {
        _postCap(1 ether);
        vm.expectRevert(Vault.UnknownCoin.selector);
        _buy(_order(1, 0.1 ether, 0), makeAddr("nobody"));
    }

    function test_dailyLimitStopsSpendingThenResetsNextDay() public {
        _fund(coinA, 10 ether);
        _postCap(HARD_MAX);
        nft.mint(seller, 10);
        nft.mint(seller, 11);

        _buy(_order(10, 3 ether, 0), coinA);
        _buy(_order(11, 2 ether, 0), coinA); // 5 ETH spent: exactly the daily limit

        nft.mint(seller, 12);
        vm.expectRevert(Vault.DailyLimitReached.selector);
        _buy(_order(12, 0.01 ether, 0), coinA);

        vm.warp(block.timestamp + 1 days);
        _postCap(HARD_MAX); // keep the cap fresh
        _buy(_order(12, 0.01 ether, 0), coinA);
        assertEq(vault.spentToday(), 0.01 ether);
    }

    // ---- order validation

    function test_rejectsWrongCollection() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        Order memory o = _order(1, 0.1 ether, 0);
        o.parameters.offer[0].token = makeAddr("otherCollection");
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o, coinA);
    }

    function test_rejectsNonErc721Offer() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        Order memory o = _order(1, 0.1 ether, 0);
        o.parameters.offer[0].itemType = ItemType.ERC1155;
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o, coinA);
    }

    function test_rejectsPaymentInAnythingButEth() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        Order memory o = _order(1, 0.1 ether, 0);
        o.parameters.consideration[0].itemType = ItemType.ERC20;
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o, coinA);
    }

    function test_rejectsRestrictedAndPartialOrders() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        OrderType[3] memory bad = [OrderType.PARTIAL_OPEN, OrderType.FULL_RESTRICTED, OrderType.CONTRACT];
        for (uint256 i = 0; i < 3; i++) {
            Order memory o = _order(1, 0.1 ether, 0);
            o.parameters.orderType = bad[i];
            vm.expectRevert(Vault.BadOrder.selector);
            _buy(o, coinA);
        }
    }

    function test_rejectsAuctionPricingAndExtraItems() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);

        Order memory o = _order(1, 0.1 ether, 0);
        o.parameters.consideration[0].endAmount = 0.2 ether; // price would move over time
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o, coinA);

        Order memory o2 = _order(1, 0.1 ether, 0.01 ether);
        o2.parameters.totalOriginalConsiderationItems = 1; // tip items appended after signing
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o2, coinA);

        Order memory o3 = _order(1, 0.1 ether, 0);
        o3.parameters.offer[0].startAmount = 2;
        vm.expectRevert(Vault.BadOrder.selector);
        _buy(o3, coinA);
    }

    // ---- a lying marketplace cannot cost us money

    function test_revertsIfNftIsNotDelivered() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        seaport.setMode(1);
        vm.expectRevert(Vault.NftNotReceived.selector);
        _buy(_order(1, 0.5 ether, 0), coinA);
        assertEq(vault.balanceOf(coinA), 1 ether, "nothing was charged");
        assertEq(address(vault).balance, 1 ether);
    }

    function test_revertsIfSeaportFails() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        seaport.setMode(3);
        vm.expectRevert("seaport reverted");
        _buy(_order(1, 0.5 ether, 0), coinA);
        assertEq(vault.balanceOf(coinA), 1 ether);
    }

    function test_revertsIfSeaportRefundsDifferentAmount() public {
        RefundingSeaport rs = new RefundingSeaport();
        Vault v = new Vault(address(nft), address(registry), address(rs), address(distributor), launcher, HARD_MAX, DAILY);
        vm.prank(launcher);
        v.registerCoin(coinA, Vault.Policy.Airdrop);
        vm.deal(address(this), 1 ether);
        v.deposit{value: 1 ether}(coinA);
        vm.prank(keeper);
        v.postCap(1 ether);
        vm.prank(seller);
        nft.setApprovalForAll(address(rs), true);

        vm.expectRevert(Vault.PriceMismatch.selector);
        vm.prank(keeper);
        v.buy(_order(1, 0.5 ether, 0), coinA);
    }

    // ---- exits

    function test_burnSendsNftToDeadAddress() public {
        _fund(coinB, 1 ether);
        _postCap(1 ether);
        _buy(_order(1, 0.5 ether, 0), coinB);

        vm.prank(makeAddr("anyone"));
        vault.burn(1);
        assertEq(nft.ownerOf(1), vault.DEAD());
        assertEq(vault.coinOfNft(1), address(0));
    }

    function test_releaseHandsNftToDistributorWithCoin() public {
        _fund(coinA, 1 ether);
        _postCap(1 ether);
        _buy(_order(1, 0.5 ether, 0), coinA);

        vault.release(1);
        assertEq(nft.ownerOf(1), address(distributor));
        assertEq(distributor.lastId(), 1);
        assertEq(distributor.lastCoin(), coinA);
    }

    function test_policyIsEnforcedPerCoin() public {
        _fund(coinA, 1 ether);
        _fund(coinB, 1 ether);
        _postCap(1 ether);
        _buy(_order(1, 0.3 ether, 0), coinA); // airdrop coin
        _buy(_order(2, 0.3 ether, 0), coinB); // burn coin

        vm.expectRevert(Vault.WrongPolicy.selector);
        vault.burn(1); // an airdrop coin's NFT can never be burned
        vm.expectRevert(Vault.WrongPolicy.selector);
        vault.release(2); // a burn coin's NFT can never be airdropped
    }

    function test_exitsRejectNftsNotBoughtForACoin() public {
        nft.mint(address(vault), 99); // donated by a stranger
        vm.expectRevert(Vault.UnknownNft.selector);
        vault.burn(99);
        vm.expectRevert(Vault.UnknownNft.selector);
        vault.release(99);
    }

    function test_nftCannotBeExitedTwice() public {
        _fund(coinB, 1 ether);
        _postCap(1 ether);
        _buy(_order(1, 0.3 ether, 0), coinB);
        vault.burn(1);
        vm.expectRevert(Vault.UnknownNft.selector);
        vault.burn(1);
    }

    // ---- no way to take the ETH out

    function test_ethCannotBeSentInByAnyoneButSeaport() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok, "plain transfers are rejected");
    }

    function testFuzz_accountingNeverLeaksEth(uint96 depositA, uint96 priceRaw) public {
        uint256 dep = bound(uint256(depositA), 0.01 ether, 4 ether);
        uint256 price = bound(uint256(priceRaw), 1, dep);
        if (price > 1 ether) price = 1 ether; // keep within the cap used below

        _fund(coinA, dep);
        _postCap(1 ether);
        _buy(_order(1, price, 0), coinA);

        assertEq(vault.balanceOf(coinA), dep - price);
        assertEq(address(vault).balance, dep - price, "vault ETH equals recorded balances");
    }
}

// ----------------------------------------------------------------------------- fork test (real Seaport 1.6)

contract VaultForkTest is VaultBase {
    address constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;
    uint256 sellerKey;

    function test_buysThroughRealSeaport() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        (seller, sellerKey) = makeAddrAndKey("realSeller");
        _deploy(SEAPORT);

        nft.mint(seller, 7);
        vm.prank(seller);
        nft.setApprovalForAll(SEAPORT, true);

        // build and sign a real fixed-price listing: 0.9 ETH to the seller + 0.05 ETH marketplace fee
        Order memory o = _order(7, 0.9 ether, 0.05 ether);
        OrderComponents memory c = OrderComponents({
            offerer: seller,
            zone: address(0),
            offer: o.parameters.offer,
            consideration: o.parameters.consideration,
            orderType: OrderType.FULL_OPEN,
            startTime: 0,
            endTime: type(uint256).max,
            zoneHash: bytes32(0),
            salt: o.parameters.salt,
            conduitKey: bytes32(0),
            counter: ISeaport(SEAPORT).getCounter(seller)
        });
        bytes32 orderHash = ISeaport(SEAPORT).getOrderHash(c);
        (, bytes32 domain,) = ISeaport(SEAPORT).information();
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, orderHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerKey, digest);
        o.signature = abi.encodePacked(r, s, v);

        _fund(coinA, 2 ether);
        _postCap(1 ether);

        uint256 sellerBefore = seller.balance;
        vm.prank(keeper);
        (uint256 id, uint256 price) = vault.buy(o, coinA);

        assertEq(id, 7);
        assertEq(price, 0.95 ether);
        assertEq(nft.ownerOf(7), address(vault), "real Seaport delivered the NFT to the vault");
        assertEq(seller.balance - sellerBefore, 0.9 ether);
        assertEq(feeRecipient.balance, 0.05 ether);
        assertEq(vault.balanceOf(coinA), 1.05 ether);
        assertEq(address(vault).balance, 1.05 ether);

        // an order that was already filled cannot be replayed
        nft.mint(seller, 7); // pretend the NFT came back
        vm.prank(keeper);
        vm.expectRevert();
        vault.buy(o, coinA);
    }
}
