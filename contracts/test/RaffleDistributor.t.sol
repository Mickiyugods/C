// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RaffleDistributor} from "../src/RaffleDistributor.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {Drand} from "../src/Drand.sol";
import {DrandVectors} from "./DrandVectors.sol";
import {MockNft} from "./Vault.t.sol";

contract MockArbSys {
    function arbBlockNumber() external pure returns (uint256) {
        return 79_000_123;
    }
}

contract MockCoin {
    uint256 public totalSupply = 1_000_000_000 ether;
}

contract RaffleDistributorTest is Test {
    CollectionRegistry registry;
    RaffleDistributor distributor;
    MockNft nft;
    MockCoin coin;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address launcher = makeAddr("launcher");
    address vault = makeAddr("vault");
    address stranger = makeAddr("stranger");

    address[4] holders;
    uint256[4] starts;
    uint256[4] ends;
    bytes32[4] leaves;
    bytes32 root;
    uint256 constant TOTAL = 1000;

    uint256 constant TOKEN_ID = 42;

    function setUp() public {
        registry = new CollectionRegistry(owner);
        nft = new MockNft();
        coin = new MockCoin();
        distributor = new RaffleDistributor(address(registry));

        vm.startPrank(owner);
        registry.setKeeper(keeper);
        registry.setLauncher(launcher);
        registry.addCollection(address(nft));
        vm.stopPrank();
        vm.prank(launcher);
        registry.registerVault(address(nft), vault);

        // four holders with weights 100, 200, 300, 400
        uint256[4] memory weights = [uint256(100), 200, 300, 400];
        uint256 cursor;
        for (uint256 i = 0; i < 4; i++) {
            holders[i] = makeAddr(string.concat("holder", vm.toString(i)));
            starts[i] = cursor;
            cursor += weights[i];
            ends[i] = cursor;
            leaves[i] = keccak256(bytes.concat(keccak256(abi.encode(i, holders[i], starts[i], ends[i]))));
        }
        bytes32 n01 = _pair(leaves[0], leaves[1]);
        bytes32 n23 = _pair(leaves[2], leaves[3]);
        root = _pair(n01, n23);

        nft.mint(vault, TOKEN_ID);
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _proof(uint256 i) internal view returns (bytes32[] memory p) {
        p = new bytes32[](2);
        if (i == 0) p[0] = leaves[1];
        else if (i == 1) p[0] = leaves[0];
        else if (i == 2) p[0] = leaves[3];
        else p[0] = leaves[2];
        p[1] = i < 2 ? _pair(leaves[2], leaves[3]) : _pair(leaves[0], leaves[1]);
    }

    /// The vault hands the NFT over exactly as Vault.release does.
    function _arrive() internal returns (uint256 id) {
        vm.prank(vault);
        nft.safeTransferFrom(vault, address(distributor), TOKEN_ID, abi.encode(address(coin)));
        id = distributor.raffleCount();
    }

    function _post(uint256 id) internal {
        vm.prank(keeper);
        distributor.postSnapshot(id, root, TOTAL);
    }

    /// Walk the clock so the pinned round is the real beacon in DrandVectors (round A).
    function _requestForBeaconA(uint256 id) internal {
        uint256 requestAt = Drand.timeOf(DrandVectors.ROUND_A) - distributor.DRAW_DELAY();
        vm.warp(requestAt - distributor.CHALLENGE_WINDOW());
        _post(id);
        vm.warp(requestAt);
        distributor.requestDraw(id);
        assertEq(distributor.raffle(id).drawRound, DrandVectors.ROUND_A, "pinned the round we have a beacon for");
    }

    function _drawWithBeaconA(uint256 id) internal {
        vm.warp(Drand.timeOf(DrandVectors.ROUND_A) + 1);
        distributor.submitDraw(id, DrandVectors.SIG_A);
    }

    function _winnerIndex(uint256 id) internal view returns (uint256) {
        uint256 t = distributor.ticketOf(id);
        for (uint256 i = 0; i < 4; i++) {
            if (t >= starts[i] && t < ends[i]) return i;
        }
        revert("ticket outside every range");
    }

    // ------------------------------------------------------------ arrival

    function test_nftFromTheRegisteredVaultOpensARaffle() public {
        uint256 id = _arrive();
        RaffleDistributor.Raffle memory r = distributor.raffle(id);
        assertEq(id, 1);
        assertEq(r.collection, address(nft));
        assertEq(r.coin, address(coin));
        assertEq(r.tokenId, TOKEN_ID);
        assertEq(r.arrivedBlock, block.number);
        assertEq(uint8(r.state), uint8(RaffleDistributor.State.Pending));
        assertEq(nft.ownerOf(TOKEN_ID), address(distributor));
    }

    function test_arrivalBlockIsTheL1OrL2NumberAsAppropriate() public {
        // no ArbSys: the plain block number
        uint256 id = _arrive();
        assertEq(distributor.raffle(id).arrivedBlock, block.number);

        // with ArbSys (an Arbitrum chain) the L2 block number is used, not block.number
        vm.etch(address(100), address(new MockArbSys()).code);
        nft.mint(vault, 43);
        vm.prank(vault);
        nft.safeTransferFrom(vault, address(distributor), 43, abi.encode(address(coin)));
        assertEq(distributor.raffle(distributor.raffleCount()).arrivedBlock, 79_000_123);
    }

    function test_nftFromAnyoneElseIsRejected() public {
        nft.mint(stranger, 7);
        vm.prank(stranger);
        vm.expectRevert("receiver rejected"); // MockNft wraps the distributor's NotFromVault revert
        nft.safeTransferFrom(stranger, address(distributor), 7, abi.encode(address(coin)));
        assertEq(nft.ownerOf(7), stranger, "NFT did not move");
    }

    function test_nftFromAnUnknownCollectionIsRejected() public {
        MockNft other = new MockNft();
        other.mint(vault, 1);
        vm.prank(vault);
        vm.expectRevert("receiver rejected");
        other.safeTransferFrom(vault, address(distributor), 1, abi.encode(address(coin)));
    }

    // ------------------------------------------------------------ snapshot

    function test_onlyKeeperPostsSnapshot() public {
        uint256 id = _arrive();
        vm.prank(stranger);
        vm.expectRevert(RaffleDistributor.NotKeeper.selector);
        distributor.postSnapshot(id, root, TOTAL);

        vm.prank(owner);
        vm.expectRevert(RaffleDistributor.NotKeeper.selector);
        distributor.postSnapshot(id, root, TOTAL);
    }

    function test_snapshotWeightMustBeSane() public {
        uint256 id = _arrive();
        uint256 tooMuch = coin.totalSupply() + 1; // read before arming expectRevert
        vm.startPrank(keeper);
        vm.expectRevert(RaffleDistributor.BadWeight.selector);
        distributor.postSnapshot(id, root, 0);
        vm.expectRevert(RaffleDistributor.BadWeight.selector);
        distributor.postSnapshot(id, root, tooMuch);
        vm.stopPrank();
    }

    function test_snapshotOnlyOncePerRound() public {
        uint256 id = _arrive();
        _post(id);
        vm.prank(keeper);
        vm.expectRevert(RaffleDistributor.WrongState.selector);
        distributor.postSnapshot(id, root, TOTAL);
    }

    function test_ownerCanRejectInsideTheWindowOnly() public {
        uint256 id = _arrive();
        _post(id);

        vm.prank(stranger);
        vm.expectRevert(RaffleDistributor.NotOwner.selector);
        distributor.rejectSnapshot(id);

        vm.prank(owner);
        distributor.rejectSnapshot(id);
        assertEq(uint8(distributor.raffle(id).state), uint8(RaffleDistributor.State.Pending));

        _post(id); // keeper reposts
        vm.warp(block.timestamp + distributor.CHALLENGE_WINDOW());
        vm.prank(owner);
        vm.expectRevert(RaffleDistributor.ChallengeWindowClosed.selector);
        distributor.rejectSnapshot(id);
    }

    // ------------------------------------------------------------ randomness

    function test_drawCannotBeRequestedInsideTheChallengeWindow() public {
        uint256 id = _arrive();
        _post(id);
        vm.warp(block.timestamp + distributor.CHALLENGE_WINDOW() - 1);
        vm.expectRevert(RaffleDistributor.ChallengeWindowOpen.selector);
        distributor.requestDraw(id);
    }

    function test_drawNeedsASnapshotFirst() public {
        uint256 id = _arrive();
        vm.expectRevert(RaffleDistributor.WrongState.selector);
        distributor.requestDraw(id);
    }

    function test_pinnedRoundIsInTheFuture() public {
        vm.warp(1_800_000_000); // a realistic date, long after drand genesis
        uint256 id = _arrive();
        _post(id);
        vm.warp(block.timestamp + distributor.CHALLENGE_WINDOW());
        distributor.requestDraw(id);
        uint64 round = distributor.raffle(id).drawRound;
        assertGe(Drand.timeOf(round), block.timestamp + distributor.DRAW_DELAY() - 3, "unknown when pinned");
    }

    function test_cannotSubmitBeforeTheRoundExists() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        vm.warp(Drand.timeOf(DrandVectors.ROUND_A) - 1);
        vm.expectRevert(RaffleDistributor.RoundNotPublished.selector);
        distributor.submitDraw(id, DrandVectors.SIG_A);
    }

    function test_wrongOrForgedSignatureIsRejected() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        vm.warp(Drand.timeOf(DrandVectors.ROUND_A) + 1);

        vm.expectRevert(RaffleDistributor.InvalidSignature.selector);
        distributor.submitDraw(id, DrandVectors.SIG_B); // a real beacon, but for another round

        vm.expectRevert(RaffleDistributor.InvalidSignature.selector);
        distributor.submitDraw(id, new bytes(128));

        vm.expectRevert(RaffleDistributor.InvalidSignature.selector);
        distributor.submitDraw(id, hex"1234");
    }

    function test_drawIsDeterministicFromTheRealBeacon() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);

        RaffleDistributor.Raffle memory r = distributor.raffle(id);
        assertEq(uint8(r.state), uint8(RaffleDistributor.State.Drawn));
        bytes32 seed = keccak256(abi.encode(Drand.randomness(DrandVectors.SIG_A), id, root));
        assertEq(r.ticket, uint256(seed) % TOTAL);
        assertLt(r.ticket, TOTAL);
    }

    // ------------------------------------------------------------ delivery

    function test_winnerReceivesTheNftAndAnyoneCanTriggerIt() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);

        uint256 w = _winnerIndex(id);
        vm.prank(stranger); // not the winner
        distributor.settle(id, w, holders[w], starts[w], ends[w], _proof(w));

        assertEq(nft.ownerOf(TOKEN_ID), holders[w], "NFT reached the winner without them doing anything");
        RaffleDistributor.Raffle memory r = distributor.raffle(id);
        assertEq(uint8(r.state), uint8(RaffleDistributor.State.Settled));
        assertEq(r.winner, holders[w]);
    }

    function test_loserLeavesCannotSettle() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);

        uint256 w = _winnerIndex(id);
        uint256 other = (w + 1) % 4;
        vm.expectRevert(RaffleDistributor.TicketNotInRange.selector);
        distributor.settle(id, other, holders[other], starts[other], ends[other], _proof(other));
    }

    function test_forgedLeafIsRejected() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);

        uint256 w = _winnerIndex(id);
        // right range, wrong person
        vm.expectRevert(RaffleDistributor.BadProof.selector);
        distributor.settle(id, w, stranger, starts[w], ends[w], _proof(w));

        // a range stretched to swallow the ticket, with the honest proof
        vm.expectRevert(RaffleDistributor.BadProof.selector);
        distributor.settle(id, w, holders[w], 0, TOTAL, _proof(w));

        // empty proof
        vm.expectRevert(RaffleDistributor.BadProof.selector);
        distributor.settle(id, w, holders[w], starts[w], ends[w], new bytes32[](0));
    }

    function test_rangeMustLieInsideTheSnapshot() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);
        vm.expectRevert(RaffleDistributor.BadRange.selector);
        distributor.settle(id, 0, holders[0], 5, 5, new bytes32[](0));
        vm.expectRevert(RaffleDistributor.BadRange.selector);
        distributor.settle(id, 0, holders[0], 0, TOTAL + 1, new bytes32[](0));
    }

    function test_cannotSettleTwice() public {
        uint256 id = _arrive();
        _requestForBeaconA(id);
        _drawWithBeaconA(id);
        uint256 w = _winnerIndex(id);
        distributor.settle(id, w, holders[w], starts[w], ends[w], _proof(w));

        vm.expectRevert(RaffleDistributor.WrongState.selector);
        distributor.settle(id, w, holders[w], starts[w], ends[w], _proof(w));
    }

    function test_cannotSettleBeforeTheDraw() public {
        uint256 id = _arrive();
        _post(id);
        vm.expectRevert(RaffleDistributor.WrongState.selector);
        distributor.settle(id, 0, holders[0], 0, 100, _proof(0));
    }

    function test_aWinnerThatCannotHoldTheNftSendsItBackToTheKeeper() public {
        // build a snapshot whose leaves name the dead address, so the draw lands on it
        address dead = distributor.DEAD();
        bytes32 deadLeaf = keccak256(bytes.concat(keccak256(abi.encode(uint256(0), dead, uint256(0), TOTAL))));

        uint256 id = _arrive();
        bytes32 deadRoot = deadLeaf; // single leaf tree: the root is the leaf, proof is empty
        uint256 requestAt = Drand.timeOf(DrandVectors.ROUND_A) - distributor.DRAW_DELAY();
        vm.warp(requestAt - distributor.CHALLENGE_WINDOW());
        vm.prank(keeper);
        distributor.postSnapshot(id, deadRoot, TOTAL);
        vm.warp(requestAt);
        distributor.requestDraw(id);
        _drawWithBeaconA(id);

        distributor.settle(id, 0, dead, 0, TOTAL, new bytes32[](0));

        assertEq(uint8(distributor.raffle(id).state), uint8(RaffleDistributor.State.Pending), "back to Pending");
        assertEq(nft.ownerOf(TOKEN_ID), address(distributor), "NFT was not sent to the dead address");
    }

    // ------------------------------------------------------------ fairness

    /// @dev The ticket comes from keccak(randomness, id, root) mod total weight. Over many seeds each of the
    ///      four holders should win roughly in proportion to its weight (10 / 20 / 30 / 40 percent).
    function test_winningOddsFollowTheWeights() public pure {
        uint256[4] memory wins;
        uint256 n = 20_000;
        for (uint256 s = 0; s < n; s++) {
            uint256 t = uint256(keccak256(abi.encode(s, "seed"))) % TOTAL;
            if (t < 100) wins[0]++;
            else if (t < 300) wins[1]++;
            else if (t < 600) wins[2]++;
            else wins[3]++;
        }
        assertApproxEqRel(wins[0], n * 10 / 100, 0.08e18);
        assertApproxEqRel(wins[1], n * 20 / 100, 0.05e18);
        assertApproxEqRel(wins[2], n * 30 / 100, 0.05e18);
        assertApproxEqRel(wins[3], n * 40 / 100, 0.05e18);
    }
}
