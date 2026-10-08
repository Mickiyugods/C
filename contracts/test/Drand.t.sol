// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Drand} from "../src/Drand.sol";

contract DrandHarness {
    function verify(uint64 round, bytes memory sig) external view returns (bool) {
        return Drand.verify(round, sig);
    }

    function roundAt(uint256 t) external pure returns (uint256) {
        return Drand.roundAt(t);
    }

    function timeOf(uint256 r) external pure returns (uint256) {
        return Drand.timeOf(r);
    }

    function randomness(bytes memory sig) external pure returns (bytes32) {
        return Drand.randomness(sig);
    }
}

/// @notice Uses two real beacons fetched from api.drand.sh (rounds 100000 and 5000000) in EIP-2537 encoding.
contract DrandTest is Test {
    DrandHarness d;

    uint64 constant ROUND_A = 100000;
    bytes constant SIG_A = hex"000000000000000000000000000000001389ee950d02e062419be63c5c71aecc7b2751edb81743927488bc74738af69e84d9d13b4b87e09e39ec97ec35f98968000000000000000000000000000000001214dd9147a3791555d1cb91f8d752a7e88388fff8c8c8ab88a4c83fb34381a2641b16291a1fd0c494f5b81db2ab203c";
    uint64 constant ROUND_B = 5000000;
    bytes constant SIG_B = hex"000000000000000000000000000000000597f735255263bf239b481d8065e0ef91eed416290da51e3ee6f128a9be29b4429525552c32fbbdb0dee406743a863b000000000000000000000000000000000f425dbb1b0738c4799f2903be18d2863ce1c4309d7c3ecb3d8ada249d59afa66df7b4f3e163bb95286daddd3a63ef22";

    function setUp() public {
        d = new DrandHarness();
    }

    function test_realBeaconsVerify() public view {
        assertTrue(d.verify(ROUND_A, SIG_A), "round A");
        assertTrue(d.verify(ROUND_B, SIG_B), "round B");
    }

    function test_signatureForAnotherRoundIsRejected() public view {
        assertFalse(d.verify(ROUND_B, SIG_A), "A signature is not B");
        assertFalse(d.verify(ROUND_A, SIG_B), "B signature is not A");
        assertFalse(d.verify(ROUND_A + 1, SIG_A), "off by one round");
    }

    function test_tamperedSignatureIsRejected() public view {
        bytes memory bad = SIG_A;
        bad[127] = bytes1(uint8(bad[127]) ^ 0x01); // y changes, so the point is not on the curve
        assertFalse(d.verify(ROUND_A, bad));

        bytes memory bad2 = SIG_A;
        bad2[63] = bytes1(uint8(bad2[63]) ^ 0x01); // x changes
        assertFalse(d.verify(ROUND_A, bad2));
    }

    function test_wrongLengthIsRejected() public view {
        assertFalse(d.verify(ROUND_A, hex""));
        assertFalse(d.verify(ROUND_A, hex"1234"));
        bytes memory longer = abi.encodePacked(SIG_A, hex"00");
        assertFalse(d.verify(ROUND_A, longer));
    }

    function test_zeroPointIsRejected() public view {
        assertFalse(d.verify(ROUND_A, new bytes(128)));
    }

    function test_randomnessIsDeterministicAndPerBeacon() public view {
        assertEq(d.randomness(SIG_A), keccak256(SIG_A));
        assertTrue(d.randomness(SIG_A) != d.randomness(SIG_B));
    }

    function test_roundTimingMatchesTheNetwork() public view {
        assertEq(d.roundAt(1692803367), 1, "genesis is round 1");
        assertEq(d.roundAt(1692803367 + 2), 1);
        assertEq(d.roundAt(1692803367 + 3), 2);
        assertEq(d.timeOf(1), 1692803367);
        assertEq(d.timeOf(100000), 1692803367 + 99999 * 3);
        assertEq(d.roundAt(d.timeOf(5000000)), 5000000);
        assertEq(d.roundAt(1000), 0, "before genesis");
    }

    function testFuzz_roundAndTimeAreConsistent(uint32 round) public view {
        vm.assume(round > 0);
        assertEq(d.roundAt(d.timeOf(round)), round);
    }
}
