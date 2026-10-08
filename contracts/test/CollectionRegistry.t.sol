// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";

contract MockErc721 {
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd || id == 0x01ffc9a7;
    }
}

contract MockNotErc721 {
    function supportsInterface(bytes4) external pure returns (bool) {
        return false;
    }
}

contract MockNoErc165 {}

contract CollectionRegistryTest is Test {
    CollectionRegistry registry;
    address owner = makeAddr("owner");
    address launcher = makeAddr("launcher");
    address stranger = makeAddr("stranger");
    address nftA;
    address nftB;

    function setUp() public {
        registry = new CollectionRegistry(owner);
        nftA = address(new MockErc721());
        nftB = address(new MockErc721());
    }

    // ------------------------------------------------------------ construction / ownership

    function test_constructorSetsOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_constructorRejectsZeroOwner() public {
        vm.expectRevert(CollectionRegistry.ZeroAddress.selector);
        new CollectionRegistry(address(0));
    }

    function test_twoStepOwnership() public {
        address next = makeAddr("next");
        vm.prank(owner);
        registry.transferOwnership(next);
        assertEq(registry.owner(), owner, "owner unchanged until accepted");

        vm.prank(stranger);
        vm.expectRevert(CollectionRegistry.NotPendingOwner.selector);
        registry.acceptOwnership();

        vm.prank(next);
        registry.acceptOwnership();
        assertEq(registry.owner(), next);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_onlyOwnerCanTransferOwnership() public {
        vm.prank(stranger);
        vm.expectRevert(CollectionRegistry.NotOwner.selector);
        registry.transferOwnership(stranger);
    }

    // ------------------------------------------------------------ listing

    function test_ownerCanListAndEmits() public {
        vm.expectEmit(true, false, false, false);
        emit CollectionRegistry.CollectionListed(nftA);
        vm.prank(owner);
        registry.addCollection(nftA);

        assertTrue(registry.isListed(nftA));
        assertEq(registry.collectionCount(), 1);
        assertEq(registry.collectionAt(0), nftA);
        assertEq(registry.infoOf(nftA).listedAt, block.timestamp);
    }

    function test_strangerCannotList() public {
        vm.prank(stranger);
        vm.expectRevert(CollectionRegistry.NotOwner.selector);
        registry.addCollection(nftA);
    }

    function test_cannotListTwice() public {
        vm.startPrank(owner);
        registry.addCollection(nftA);
        vm.expectRevert(CollectionRegistry.AlreadyListed.selector);
        registry.addCollection(nftA);
        vm.stopPrank();
    }

    function test_rejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CollectionRegistry.ZeroAddress.selector);
        registry.addCollection(address(0));
    }

    function test_rejectsEoaAndNonErc721() public {
        vm.startPrank(owner);
        vm.expectRevert(CollectionRegistry.NotAnErc721.selector);
        registry.addCollection(makeAddr("eoa"));

        address notNft = address(new MockNotErc721());
        vm.expectRevert(CollectionRegistry.NotAnErc721.selector);
        registry.addCollection(notNft);

        address noErc165 = address(new MockNoErc165());
        vm.expectRevert(CollectionRegistry.NotAnErc721.selector);
        registry.addCollection(noErc165);
        vm.stopPrank();
    }

    function test_delistAndRelistKeepsSingleIndexEntry() public {
        vm.startPrank(owner);
        registry.addCollection(nftA);
        registry.delistCollection(nftA);
        assertFalse(registry.isListed(nftA));

        registry.addCollection(nftA);
        assertTrue(registry.isListed(nftA));
        vm.stopPrank();

        assertEq(registry.collectionCount(), 1, "no duplicate index entry");
    }

    function test_delistRequiresListed() public {
        vm.prank(owner);
        vm.expectRevert(CollectionRegistry.NotListed.selector);
        registry.delistCollection(nftA);
    }

    // ------------------------------------------------------------ launcher and vaults

    function test_launcherSetOnce() public {
        vm.startPrank(owner);
        registry.setLauncher(launcher);
        assertEq(registry.launcher(), launcher);

        vm.expectRevert(CollectionRegistry.LauncherAlreadySet.selector);
        registry.setLauncher(makeAddr("other"));
        vm.stopPrank();
    }

    function test_setLauncherRejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(CollectionRegistry.ZeroAddress.selector);
        registry.setLauncher(address(0));
    }

    function test_onlyLauncherRegistersVault() public {
        vm.startPrank(owner);
        registry.setLauncher(launcher);
        registry.addCollection(nftA);
        vm.stopPrank();

        address vault = makeAddr("vault");
        vm.prank(stranger);
        vm.expectRevert(CollectionRegistry.NotLauncher.selector);
        registry.registerVault(nftA, vault);

        vm.prank(owner); // even the owner cannot
        vm.expectRevert(CollectionRegistry.NotLauncher.selector);
        registry.registerVault(nftA, vault);

        vm.prank(launcher);
        registry.registerVault(nftA, vault);
        assertEq(registry.vaultOf(nftA), vault);
    }

    function test_vaultRegisteredOnlyOncePerCollection() public {
        vm.startPrank(owner);
        registry.setLauncher(launcher);
        registry.addCollection(nftA);
        vm.stopPrank();

        vm.startPrank(launcher);
        registry.registerVault(nftA, makeAddr("v1"));
        vm.expectRevert(CollectionRegistry.VaultAlreadyRegistered.selector);
        registry.registerVault(nftA, makeAddr("v2"));
        vm.stopPrank();
    }

    function test_cannotRegisterVaultForUnknownCollection() public {
        vm.prank(owner);
        registry.setLauncher(launcher);

        vm.prank(launcher);
        vm.expectRevert(CollectionRegistry.NotListed.selector);
        registry.registerVault(nftA, makeAddr("vault"));
    }

    function test_delistingDoesNotTouchExistingVault() public {
        vm.startPrank(owner);
        registry.setLauncher(launcher);
        registry.addCollection(nftA);
        vm.stopPrank();

        address vault = makeAddr("vault");
        vm.prank(launcher);
        registry.registerVault(nftA, vault);

        vm.prank(owner);
        registry.delistCollection(nftA);

        assertFalse(registry.isListed(nftA));
        assertEq(registry.vaultOf(nftA), vault, "existing coins keep their vault");
    }

    function test_ownerSetsAndReplacesKeeper() public {
        address k1 = makeAddr("k1");
        address k2 = makeAddr("k2");
        vm.startPrank(owner);
        registry.setKeeper(k1);
        assertEq(registry.keeper(), k1);
        registry.setKeeper(k2);
        assertEq(registry.keeper(), k2);
        registry.setKeeper(address(0)); // halts buying everywhere
        assertEq(registry.keeper(), address(0));
        vm.stopPrank();
    }

    function test_strangerCannotSetKeeper() public {
        vm.prank(stranger);
        vm.expectRevert(CollectionRegistry.NotOwner.selector);
        registry.setKeeper(stranger);
    }

    // ------------------------------------------------------------ views

    function test_pagination() public {
        vm.startPrank(owner);
        registry.addCollection(nftA);
        registry.addCollection(nftB);
        vm.stopPrank();

        address[] memory all = registry.collectionsPage(0, 10);
        assertEq(all.length, 2);
        assertEq(all[0], nftA);
        assertEq(all[1], nftB);

        address[] memory second = registry.collectionsPage(1, 1);
        assertEq(second.length, 1);
        assertEq(second[0], nftB);

        assertEq(registry.collectionsPage(5, 3).length, 0, "offset past the end");
    }

    function testFuzz_onlyOwnerCanList(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(CollectionRegistry.NotOwner.selector);
        registry.addCollection(nftA);
    }
}

/// @notice Runs against real Robinhood Chain collections. Skipped unless ROBINHOOD_RPC_URL is set.
contract CollectionRegistryForkTest is Test {
    address constant PONSGUY = 0x9d1497d448a75E7d1A055D74cFfA50BC15120845;
    address constant STONKBROKERS = 0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0;

    function test_realCollectionsAreAccepted() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        CollectionRegistry registry = new CollectionRegistry(address(this));
        registry.addCollection(PONSGUY);
        registry.addCollection(STONKBROKERS);
        assertTrue(registry.isListed(PONSGUY));
        assertTrue(registry.isListed(STONKBROKERS));
    }
}
