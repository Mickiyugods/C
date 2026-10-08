// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISeaport, Order, OrderParameters, ItemType, OrderType} from "./interfaces/ISeaport.sol";

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
}

interface IRegistryKeeper {
    function keeper() external view returns (address);
}

/// @title Vault
/// @notice Shared by every coin paired with one NFT collection. Holds the ETH those coins' fees produced
///         and spends it on exactly one thing: buying this collection's NFTs through Seaport.
/// @dev There is NO function that sends ETH anywhere except to Seaport for a purchase, and NFTs only leave
///      through `burn` or `release`. The keeper posts the price cap and chooses which listing to buy, but it
///      cannot move funds: the contract validates every Seaport order itself.
contract Vault {
    enum Policy {
        None,
        Airdrop,
        Burn
    }

    // ---------------------------------------------------------------- keeper limits (constants)

    /// @notice A new cap may exceed the previous one by at most this much, and at most once per interval.
    uint256 public constant MAX_RAISE_BPS = 1_000; // +10%
    uint256 public constant MIN_RAISE_INTERVAL = 1 hours;
    /// @notice A cap older than this is ignored, so a dead keeper cannot leave a stale high cap behind.
    uint256 public constant CAP_TTL = 2 days;
    uint256 private constant BPS = 10_000;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ---------------------------------------------------------------- immutables

    address public immutable collection;
    address public immutable registry;
    address public immutable seaport;
    address public immutable distributor;
    address public immutable launcher;
    /// @notice Absolute ceiling for a single NFT price, whatever the keeper posts.
    uint256 public immutable hardMaxCap;
    /// @notice Most ETH this vault may spend on NFTs per UTC day.
    uint256 public immutable dailyLimit;

    // ---------------------------------------------------------------- state

    uint256 public cap; // max price of one NFT (wei)
    uint256 public capPostedAt;
    uint256 public lastRaiseAt;

    mapping(address coin => Policy) public policyOf;
    mapping(address coin => uint256) public balanceOf;
    mapping(uint256 tokenId => address coin) public coinOfNft;

    uint256 public currentDay;
    uint256 public spentToday;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event CoinRegistered(address indexed coin, Policy policy);
    event Deposited(address indexed coin, uint256 amount);
    event CapPosted(uint256 cap);
    event Bought(address indexed coin, uint256 indexed tokenId, uint256 price);
    event Burned(address indexed coin, uint256 indexed tokenId);
    event Released(address indexed coin, uint256 indexed tokenId);

    // ---------------------------------------------------------------- errors

    error NotLauncher();
    error NotKeeper();
    error ZeroAddress();
    error ZeroAmount();
    error AlreadyRegistered();
    error UnknownCoin();
    error WrongPolicy();
    error CapAboveCeiling();
    error CapRaiseTooLarge();
    error CapRaiseTooSoon();
    error CapStale();
    error BadOrder();
    error AboveCap();
    error InsufficientCoinBalance();
    error DailyLimitReached();
    error PriceMismatch();
    error NftNotReceived();
    error UnknownNft();
    error NotSeaport();
    error UnexpectedNft();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address collection_,
        address registry_,
        address seaport_,
        address distributor_,
        address launcher_,
        uint256 hardMaxCap_,
        uint256 dailyLimit_
    ) {
        if (
            collection_ == address(0) || registry_ == address(0) || seaport_ == address(0)
                || distributor_ == address(0) || launcher_ == address(0)
        ) revert ZeroAddress();
        if (hardMaxCap_ == 0 || dailyLimit_ == 0) revert ZeroAmount();
        collection = collection_;
        registry = registry_;
        seaport = seaport_;
        distributor = distributor_;
        launcher = launcher_;
        hardMaxCap = hardMaxCap_;
        dailyLimit = dailyLimit_;
    }

    // ---------------------------------------------------------------- coins

    /// @notice Called once per coin by the Launcher. Fixes what happens to the NFTs bought for that coin.
    function registerCoin(address coin, Policy policy) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (coin == address(0)) revert ZeroAddress();
        if (policy == Policy.None) revert WrongPolicy();
        if (policyOf[coin] != Policy.None) revert AlreadyRegistered();
        policyOf[coin] = policy;
        emit CoinRegistered(coin, policy);
    }

    /// @notice Credit `coin` with the ETH sent. The FeeRouter calls this with 80% of each harvest.
    function deposit(address coin) external payable {
        if (policyOf[coin] == Policy.None) revert UnknownCoin();
        if (msg.value == 0) revert ZeroAmount();
        balanceOf[coin] += msg.value;
        emit Deposited(coin, msg.value);
    }

    // ---------------------------------------------------------------- keeper

    /// @notice The keeper posts the highest price one NFT may cost. It can lower the cap at any time, but
    ///         can raise it only by MAX_RAISE_BPS once per MIN_RAISE_INTERVAL, and never above `hardMaxCap`.
    function postCap(uint256 newCap) external {
        address keeper_ = IRegistryKeeper(registry).keeper();
        if (keeper_ == address(0) || msg.sender != keeper_) revert NotKeeper();
        if (newCap == 0 || newCap > hardMaxCap) revert CapAboveCeiling();

        if (newCap > cap) {
            if (cap != 0) {
                if (newCap > (cap * (BPS + MAX_RAISE_BPS)) / BPS) revert CapRaiseTooLarge();
                if (block.timestamp < lastRaiseAt + MIN_RAISE_INTERVAL) revert CapRaiseTooSoon();
            }
            lastRaiseAt = block.timestamp;
        }
        cap = newCap;
        capPostedAt = block.timestamp;
        emit CapPosted(newCap);
    }

    // ---------------------------------------------------------------- buying

    /// @notice Buy one NFT of `collection` with an off-chain Seaport listing, charging `coin`.
    /// @dev Only the keeper may call, because it picks WHICH listing to buy (the cheapest). If anyone could call,
    ///      a seller could list an NFT exactly at the cap and sell it to the vault at that price again and again.
    ///      Even so the keeper cannot move funds: the order must be a plain fixed-price sale of one NFT of this
    ///      collection paid entirely in ETH, priced at or below the cap, the coin's balance and the daily limit.
    function buy(Order calldata order, address coin) external nonReentrant returns (uint256 tokenId, uint256 price) {
        address keeper_ = IRegistryKeeper(registry).keeper();
        if (keeper_ == address(0) || msg.sender != keeper_) revert NotKeeper();
        if (policyOf[coin] == Policy.None) revert UnknownCoin();
        if (cap == 0 || block.timestamp > capPostedAt + CAP_TTL) revert CapStale();

        OrderParameters calldata p = order.parameters;
        if (p.orderType != OrderType.FULL_OPEN) revert BadOrder();
        if (p.offer.length != 1 || p.consideration.length == 0) revert BadOrder();
        if (p.consideration.length != p.totalOriginalConsiderationItems) revert BadOrder();

        {
            if (p.offer[0].itemType != ItemType.ERC721 || p.offer[0].token != collection) revert BadOrder();
            if (p.offer[0].startAmount != 1 || p.offer[0].endAmount != 1) revert BadOrder();
        }
        tokenId = p.offer[0].identifierOrCriteria;

        for (uint256 i = 0; i < p.consideration.length; i++) {
            if (p.consideration[i].itemType != ItemType.NATIVE) revert BadOrder();
            if (p.consideration[i].startAmount != p.consideration[i].endAmount) revert BadOrder(); // fixed price
            price += p.consideration[i].startAmount;
        }

        if (price > cap) revert AboveCap();
        if (price > balanceOf[coin]) revert InsufficientCoinBalance();
        _recordSpend(price);

        balanceOf[coin] -= price;

        uint256 balanceBefore = address(this).balance;
        ISeaport(seaport).fulfillOrder{value: price}(order, bytes32(0));
        if (address(this).balance != balanceBefore - price) revert PriceMismatch();
        if (IERC721Minimal(collection).ownerOf(tokenId) != address(this)) revert NftNotReceived();

        coinOfNft[tokenId] = coin;
        emit Bought(coin, tokenId, price);
    }

    // ---------------------------------------------------------------- NFT exits

    /// @notice Send an NFT bought for a coin whose policy is Burn to the dead address. Anyone may call.
    function burn(uint256 tokenId) external nonReentrant {
        address coin = coinOfNft[tokenId];
        if (coin == address(0)) revert UnknownNft();
        if (policyOf[coin] != Policy.Burn) revert WrongPolicy();
        delete coinOfNft[tokenId];
        IERC721Minimal(collection).transferFrom(address(this), DEAD, tokenId);
        emit Burned(coin, tokenId);
    }

    /// @notice Hand an NFT bought for a coin whose policy is Airdrop to the raffle distributor.
    function release(uint256 tokenId) external nonReentrant {
        address coin = coinOfNft[tokenId];
        if (coin == address(0)) revert UnknownNft();
        if (policyOf[coin] != Policy.Airdrop) revert WrongPolicy();
        delete coinOfNft[tokenId];
        IERC721Minimal(collection).safeTransferFrom(address(this), distributor, tokenId, abi.encode(coin));
        emit Released(coin, tokenId);
    }

    // ---------------------------------------------------------------- receiving

    /// @dev Seaport refunds nothing when the exact price is sent, but accept ETH only from Seaport anyway.
    receive() external payable {
        if (msg.sender != seaport) revert NotSeaport();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != collection) revert UnexpectedNft();
        return this.onERC721Received.selector;
    }

    // ---------------------------------------------------------------- internal

    function _recordSpend(uint256 amount) private {
        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) {
            currentDay = day;
            spentToday = 0;
        }
        if (spentToday + amount > dailyLimit) revert DailyLimitReached();
        spentToday += amount;
    }
}
