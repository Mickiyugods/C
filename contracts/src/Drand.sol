// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Drand
/// @notice On-chain verification of beacons from the drand "quicknet" network (chain hash
///         52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971), using the BLS12-381
///         precompiles of EIP-2537 that Robinhood Chain provides.
/// @dev Quicknet is unchained and signs on G1 (scheme bls-unchained-g1-rfc9380): the message for round r is
///      sha256(r as 8 big-endian bytes), hashed to G1 per RFC 9380 with the DST below, and the signature
///      is valid when e(sig, g2) == e(H(msg), pk). A valid signature for a round cannot exist before the
///      network produces that round, and for a given round there is exactly one, so its hash is a random
///      value that nobody (including us) could have chosen.
library Drand {
    uint256 internal constant GENESIS_TIME = 1692803367;
    uint256 internal constant PERIOD = 3;

    address private constant MODEXP = address(0x05);
    address private constant G1_ADD = address(0x0b);
    address private constant PAIRING = address(0x0f);
    address private constant MAP_FP_TO_G1 = address(0x10);

    bytes private constant DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

    /// @dev BLS12-381 base field prime (48 bytes).
    bytes private constant FIELD_P =
        hex"1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab";

    /// @dev drand quicknet public key (G2), EIP-2537 encoding: x.c0, x.c1, y.c0, y.c1 as 64 byte words.
    bytes private constant PUBLIC_KEY =
        hex"000000000000000000000000000000000d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a0000000000000000000000000000000003cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d106451000000000000000000000000000000000e5db2b6bfbb01c867749cadffca88b36c24f3012ba09fc4d3022c5c37dce0f977d3adb5d183c7477c442b1f045152730000000000000000000000000000000001a714f2edb74119a2f2b0d5a7c75ba902d163700a61bc224ededd8e63aef7be1aaf8e93d7a9718b047ccddb3eb5d68b";

    /// @dev Negated G2 generator, EIP-2537 encoding.
    bytes private constant NEG_G2_GENERATOR =
        hex"00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80000000000000000000000000000000013e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e000000000000000000000000000000000d1b3cc2c7027888be51d9ef691d77bcb679afda66c73f17f9ee3837a55024f78c71363275a75d75d86bab79f74782aa0000000000000000000000000000000013fa4d4a0ad8b1ce186ed5061789213d993923066dddaf1040bc3ff59f825c78df74f2d75467e25e0f55f8a00fa030ed";

    error PrecompileFailed();

    /// @notice The round whose time is the first one at or after `timestamp`.
    function roundAt(uint256 timestamp) internal pure returns (uint256) {
        if (timestamp < GENESIS_TIME) return 0;
        return (timestamp - GENESIS_TIME) / PERIOD + 1;
    }

    /// @notice Unix time at which `round` is published.
    function timeOf(uint256 round) internal pure returns (uint256) {
        return GENESIS_TIME + (round - 1) * PERIOD;
    }

    /// @notice True if `signature` (uncompressed G1 point: x then y as 64 byte words, 128 bytes) is the valid
    ///         quicknet signature of `round`.
    function verify(uint64 round, bytes memory signature) internal view returns (bool) {
        if (signature.length != 128) return false;

        bytes memory hashed = _hashToG1(abi.encodePacked(sha256(abi.encodePacked(round))));

        // e(sig, -g2) * e(H(m), pk) == 1  <=>  e(sig, g2) == e(H(m), pk)
        (bool ok, bytes memory out) =
            PAIRING.staticcall{gas: 500_000}(abi.encodePacked(signature, NEG_G2_GENERATOR, hashed, PUBLIC_KEY));
        // An invalid point makes the precompile fail; that simply means the signature is not valid.
        return ok && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }

    /// @notice The random value derived from a verified signature.
    function randomness(bytes memory signature) internal pure returns (bytes32) {
        return keccak256(signature);
    }

    // ------------------------------------------------------------------ hash to curve (RFC 9380)

    function _hashToG1(bytes memory message) private view returns (bytes memory) {
        bytes memory dstPrime = abi.encodePacked(DST, uint8(DST.length));

        bytes32 b0 = sha256(abi.encodePacked(new bytes(64), message, uint16(128), uint8(0), dstPrime));
        bytes32 b1 = sha256(abi.encodePacked(b0, uint8(1), dstPrime));
        bytes32 b2 = sha256(abi.encodePacked(b0 ^ b1, uint8(2), dstPrime));
        bytes32 b3 = sha256(abi.encodePacked(b0 ^ b2, uint8(3), dstPrime));
        bytes32 b4 = sha256(abi.encodePacked(b0 ^ b3, uint8(4), dstPrime));

        bytes memory q0 = _mapToCurve(_reduce(abi.encodePacked(b1, b2)));
        bytes memory q1 = _mapToCurve(_reduce(abi.encodePacked(b3, b4)));

        (bool ok, bytes memory sum) = G1_ADD.staticcall(abi.encodePacked(q0, q1));
        if (!ok || sum.length != 128) revert PrecompileFailed();
        return sum;
    }

    /// @dev 64 bytes (big-endian integer) modulo the field prime, returned as a 64 byte padded field element.
    function _reduce(bytes memory wide) private view returns (bytes memory) {
        (bool ok, bytes memory out) =
            MODEXP.staticcall(abi.encodePacked(uint256(64), uint256(1), uint256(48), wide, uint8(1), FIELD_P));
        if (!ok || out.length != 48) revert PrecompileFailed();
        return abi.encodePacked(new bytes(16), out);
    }

    function _mapToCurve(bytes memory fieldElement) private view returns (bytes memory) {
        (bool ok, bytes memory point) = MAP_FP_TO_G1.staticcall(fieldElement);
        if (!ok || point.length != 128) revert PrecompileFailed();
        return point;
    }
}
