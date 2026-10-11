// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Drand} from "./Drand.sol";

interface IRaffleRegistry {
    function keeper() external view returns (address);
    function owner() external view returns (address);
    function vaultOf(address collection) external view returns (address);
}

interface IERC20Supply {
    function totalSupply() external view returns (uint256);
}

interface IERC721Transfer {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @title RaffleDistributor
/// @notice Receives the NFTs a vault bought for a coin with the Airdrop policy and gives each one to a single
///         holder of that coin, chosen at random with odds proportional to balance.
/// @dev Lifecycle of one raffle (one NFT):
///        Pending   NFT arrived from a vault.
///        Posted    The keeper posted a holder snapshot as a Merkle root of weight ranges.
///        Requested After a 15 minute challenge window anyone pins a future drand round.
///        Drawn     Anyone submits that round's signature; it is verified on-chain and fixes the winning ticket.
///        Settled   Anyone supplies the winner's leaf and proof; the NFT is sent to the winner.
///      The randomness cannot be chosen by anyone. What the keeper is trusted for is the snapshot (who held
///      how much); the challenge window lets the community check it, and the registry owner can reject it.
contract RaffleDistributor {
    enum State {
        None,
        Pending,
        Posted,
        Requested,
        Drawn,
        Settled
    }

    struct Raffle {
        address collection;
        address coin;
        uint256 tokenId;
        uint64 arrivedBlock;
        State state;
        bytes32 root;
        uint256 totalWeight;
        uint64 postedAt;
        uint64 drawRound;
        uint256 ticket;
        address winner;
    }

    uint256 public constant CHALLENGE_WINDOW = 15 minutes;
    /// @notice The pinned drand round is at least this far in the future, so it is unknown when pinned.
    uint256 public constant DRAW_DELAY = 30 seconds;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    /// @dev Arbitrum's ArbSys precompile. On Arbitrum-based chains (Robinhood Chain included) `block.number`
    ///      is the L1 block number, while logs and RPC use the L2 block number, so the L2 number is read here.
    address private constant ARB_SYS = address(100);

    IRaffleRegistry public immutable registry;

    uint256 public raffleCount;
    mapping(uint256 id => Raffle) private _raffles;

    uint256 private _lock = 1;

    event RaffleCreated(uint256 indexed id, address indexed collection, address indexed coin, uint256 tokenId, uint64 arrivedBlock);
    event SnapshotPosted(uint256 indexed id, bytes32 root, uint256 totalWeight);
    event SnapshotRejected(uint256 indexed id);
    event DrawRequested(uint256 indexed id, uint64 drawRound);
    event Drawn(uint256 indexed id, uint256 ticket);
    event Settled(uint256 indexed id, address indexed winner, uint256 tokenId);
    event WinnerInvalid(uint256 indexed id, address winner);

    error ZeroAddress();
    error NotKeeper();
    error NotOwner();
    error NotFromVault();
    error WrongState();
    error BadWeight();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error RoundNotPublished();
    error InvalidSignature();
    error TicketNotInRange();
    error BadProof();
    error BadRange();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IRaffleRegistry(registry_);
    }

    // ---------------------------------------------------------------- 1. NFT arrives

    /// @dev Only a vault the registry knows for the sending collection can open a raffle.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata data) external returns (bytes4) {
        address collection = msg.sender;
        if (from == address(0) || registry.vaultOf(collection) != from) revert NotFromVault();
        address coin = abi.decode(data, (address));

        uint256 id = ++raffleCount;
        Raffle storage r = _raffles[id];
        r.collection = collection;
        r.coin = coin;
        r.tokenId = tokenId;
        uint64 arrived = _l2BlockNumber();
        r.arrivedBlock = arrived;
        r.state = State.Pending;
        emit RaffleCreated(id, collection, coin, tokenId, arrived);
        return this.onERC721Received.selector;
    }

    // ---------------------------------------------------------------- 2. snapshot

    /// @notice The keeper posts who held how much of the coin at `arrivedBlock`, as a Merkle root over weight
    ///         ranges. Leaf = keccak256(keccak256(abi.encode(index, holder, start, end))) and the ranges tile
    ///         [0, totalWeight). Contracts that must not win (the curve, pools) are left out of the snapshot.
    function postSnapshot(uint256 id, bytes32 root, uint256 totalWeight) external {
        address keeper = registry.keeper();
        if (keeper == address(0) || msg.sender != keeper) revert NotKeeper();
        Raffle storage r = _raffles[id];
        if (r.state != State.Pending) revert WrongState();
        if (totalWeight == 0 || totalWeight > IERC20Supply(r.coin).totalSupply()) revert BadWeight();

        r.root = root;
        r.totalWeight = totalWeight;
        r.postedAt = uint64(block.timestamp);
        r.state = State.Posted;
        emit SnapshotPosted(id, root, totalWeight);
    }

    /// @notice During the challenge window the registry owner can throw a snapshot out; the keeper must repost.
    function rejectSnapshot(uint256 id) external {
        if (msg.sender != registry.owner()) revert NotOwner();
        Raffle storage r = _raffles[id];
        if (r.state != State.Posted) revert WrongState();
        if (block.timestamp >= r.postedAt + CHALLENGE_WINDOW) revert ChallengeWindowClosed();
        r.state = State.Pending;
        emit SnapshotRejected(id);
    }

    // ---------------------------------------------------------------- 3. randomness

    /// @notice Pin the drand round that will decide this raffle. Anyone may call once the window has closed.
    function requestDraw(uint256 id) external {
        Raffle storage r = _raffles[id];
        if (r.state != State.Posted) revert WrongState();
        if (block.timestamp < r.postedAt + CHALLENGE_WINDOW) revert ChallengeWindowOpen();

        r.drawRound = uint64(Drand.roundAt(block.timestamp + DRAW_DELAY));
        r.state = State.Requested;
        emit DrawRequested(id, r.drawRound);
    }

    /// @notice Submit the drand signature of the pinned round (uncompressed G1, 128 bytes). It is verified
    ///         on-chain, so anyone can do this and nobody can supply a different value.
    function submitDraw(uint256 id, bytes calldata signature) external {
        Raffle storage r = _raffles[id];
        if (r.state != State.Requested) revert WrongState();
        if (block.timestamp < Drand.timeOf(r.drawRound)) revert RoundNotPublished();
        if (!Drand.verify(r.drawRound, signature)) revert InvalidSignature();

        bytes32 seed = keccak256(abi.encode(Drand.randomness(signature), id, r.root));
        r.ticket = uint256(seed) % r.totalWeight;
        r.state = State.Drawn;
        emit Drawn(id, r.ticket);
    }

    // ---------------------------------------------------------------- 4. delivery

    /// @notice Deliver the NFT to the holder whose range contains the winning ticket. Anyone may call with the
    ///         winner's leaf and Merkle proof; no one has to claim anything.
    function settle(uint256 id, uint256 index, address holder, uint256 start, uint256 end, bytes32[] calldata proof)
        external
        nonReentrant
    {
        Raffle storage r = _raffles[id];
        if (r.state != State.Drawn) revert WrongState();
        if (start >= end || end > r.totalWeight) revert BadRange();
        if (r.ticket < start || r.ticket >= end) revert TicketNotInRange();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, holder, start, end))));
        if (!_verify(proof, r.root, leaf)) revert BadProof();

        // A snapshot that names an address that cannot hold the NFT goes back to the keeper to be fixed.
        if (holder == address(0) || holder == DEAD || holder == address(this) || holder == r.coin || holder == r.collection) {
            r.state = State.Pending;
            emit WinnerInvalid(id, holder);
            return;
        }

        r.winner = holder;
        r.state = State.Settled;
        IERC721Transfer(r.collection).transferFrom(address(this), holder, r.tokenId);
        emit Settled(id, holder, r.tokenId);
    }

    // ---------------------------------------------------------------- views

    function raffle(uint256 id) external view returns (Raffle memory) {
        return _raffles[id];
    }

    function ticketOf(uint256 id) external view returns (uint256) {
        return _raffles[id].ticket;
    }


    // ---------------------------------------------------------------- internal

    /// @dev The block number off-chain tools see: ArbSys.arbBlockNumber() on Arbitrum chains, else block.number.
    function _l2BlockNumber() private view returns (uint64) {
        (bool ok, bytes memory data) = ARB_SYS.staticcall(abi.encodeWithSignature("arbBlockNumber()"));
        if (ok && data.length == 32) return uint64(abi.decode(data, (uint256)));
        return uint64(block.number);
    }

    /// @dev Merkle proof check with sorted pairs (same convention as OpenZeppelin's MerkleProof).
    function _verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf) private pure returns (bool) {
        bytes32 hash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            hash = hash < p ? keccak256(abi.encodePacked(hash, p)) : keccak256(abi.encodePacked(p, hash));
        }
        return hash == root;
    }
}
