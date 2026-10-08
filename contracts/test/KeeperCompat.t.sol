// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RaffleDistributor} from "../src/RaffleDistributor.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {Drand} from "../src/Drand.sol";
import {DrandVectors} from "./DrandVectors.sol";
import {MockNft} from "./Vault.t.sol";
import {MockCoin} from "./RaffleDistributor.t.sol";

/// @notice Checks that a snapshot built by the keeper (JavaScript, keeper/src/snapshot.mjs) is accepted by the
///         contract. The fixture is produced by `node keeper/scripts/make-fixture.mjs`.
///         Eight raffles share the same snapshot but have different ids, so they land on different winners and
///         exercise many leaves and proof lengths.
contract KeeperCompatTest is Test {
    CollectionRegistry registry;
    RaffleDistributor distributor;
    MockNft nft;
    MockCoin coin;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address launcher = makeAddr("launcher");
    address vault = makeAddr("vault");

    struct Row {
        uint256 index;
        address holder;
        uint256 start;
        uint256 end;
        bytes32[] proof;
    }

    function _load() internal view returns (bytes32 root, uint256 total, Row[] memory rows) {
        string memory json = vm.readFile("test/fixtures/keeper-snapshot.json");
        root = vm.parseJsonBytes32(json, ".root");
        total = vm.parseJsonUint(json, ".totalWeight");
        uint256 n = abi.decode(vm.parseJson(json, ".holders[*].index"), (uint256[])).length;
        rows = new Row[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory p = string.concat(".holders[", vm.toString(i), "]");
            rows[i].index = vm.parseJsonUint(json, string.concat(p, ".index"));
            rows[i].holder = vm.parseJsonAddress(json, string.concat(p, ".holder"));
            rows[i].start = vm.parseJsonUint(json, string.concat(p, ".start"));
            rows[i].end = vm.parseJsonUint(json, string.concat(p, ".end"));
            rows[i].proof = vm.parseJsonBytes32Array(json, string.concat(p, ".proof"));
        }
    }

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
    }

    function test_snapshotsBuiltByTheKeeperAreAccepted() public {
        (bytes32 root, uint256 total, Row[] memory rows) = _load();
        assertGt(rows.length, 5);
        assertLe(total, coin.totalSupply(), "fixture weight fits the mock coin supply");

        uint256 raffles = 8;
        for (uint256 t = 1; t <= raffles; t++) {
            nft.mint(vault, t);
            vm.prank(vault);
            nft.safeTransferFrom(vault, address(distributor), t, abi.encode(address(coin)));
        }

        uint256 requestAt = Drand.timeOf(DrandVectors.ROUND_A) - distributor.DRAW_DELAY();
        vm.warp(requestAt - distributor.CHALLENGE_WINDOW());
        for (uint256 id = 1; id <= raffles; id++) {
            vm.prank(keeper);
            distributor.postSnapshot(id, root, total);
        }
        vm.warp(requestAt);
        for (uint256 id = 1; id <= raffles; id++) {
            distributor.requestDraw(id);
        }
        vm.warp(Drand.timeOf(DrandVectors.ROUND_A) + 1);

        bool[] memory won = new bool[](rows.length);
        uint256 distinct;
        for (uint256 id = 1; id <= raffles; id++) {
            distributor.submitDraw(id, DrandVectors.SIG_A);
            uint256 ticket = distributor.ticketOf(id);

            // pick the fixture row whose range contains the ticket, as the keeper does
            uint256 w = type(uint256).max;
            for (uint256 i = 0; i < rows.length; i++) {
                if (ticket >= rows[i].start && ticket < rows[i].end) {
                    w = i;
                    break;
                }
            }
            assertTrue(w != type(uint256).max, "ticket falls in some range");

            distributor.settle(id, rows[w].index, rows[w].holder, rows[w].start, rows[w].end, rows[w].proof);
            assertEq(nft.ownerOf(id), rows[w].holder, "the NFT reached the holder chosen by the keeper's snapshot");
            if (!won[w]) {
                won[w] = true;
                distinct++;
            }
        }
        assertGt(distinct, 2, "the eight raffles hit several different leaves");
    }
}
