// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title CollectionRegistry
/// @notice The list of NFT collections a coin may be paired with, and the shared vault of each one.
/// @dev The owner curates the list (add / delist). Delisting only stops NEW coins from pairing; coins that
///      already launched keep their router and vault untouched, because those are bound at launch and
///      this registry has no power over them. One vault exists per collection and is registered by the
///      Launcher exactly once.
contract CollectionRegistry {
    bytes4 private constant ERC721_INTERFACE_ID = 0x80ac58cd;

    struct Info {
        bool listed; // can new coins pair with it
        bool known; // has ever been listed (keeps the index stable after delisting)
        address vault; // shared vault, zero until the first coin launches
        uint64 listedAt;
    }

    address public owner;
    address public pendingOwner;
    address public launcher;
    /// @notice The bot allowed to post price caps in every vault. It can never move funds. Zero halts buying.
    address public keeper;

    mapping(address => Info) private _info;
    address[] private _collections;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LauncherSet(address indexed launcher);
    event KeeperSet(address indexed keeper);
    event CollectionListed(address indexed collection);
    event CollectionDelisted(address indexed collection);
    event VaultRegistered(address indexed collection, address indexed vault);

    error NotOwner();
    error NotPendingOwner();
    error NotLauncher();
    error ZeroAddress();
    error LauncherAlreadySet();
    error AlreadyListed();
    error NotListed();
    error NotAnErc721();
    error VaultAlreadyRegistered();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    // ---------------------------------------------------------------- ownership (two step)

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---------------------------------------------------------------- admin

    /// @notice One-time wiring: the Launcher is the only contract allowed to register vaults.
    function setLauncher(address newLauncher) external onlyOwner {
        if (launcher != address(0)) revert LauncherAlreadySet();
        if (newLauncher == address(0)) revert ZeroAddress();
        launcher = newLauncher;
        emit LauncherSet(newLauncher);
    }

    /// @notice Replace the keeper (for example after a key leak). Zero stops every vault from buying.
    function setKeeper(address newKeeper) external onlyOwner {
        keeper = newKeeper;
        emit KeeperSet(newKeeper);
    }

    /// @notice Allow new coins to pair with `collection`. It must report ERC-721 through ERC-165.
    function addCollection(address collection) external onlyOwner {
        if (collection == address(0)) revert ZeroAddress();
        Info storage i = _info[collection];
        if (i.listed) revert AlreadyListed();
        if (!_isErc721(collection)) revert NotAnErc721();

        i.listed = true;
        i.listedAt = uint64(block.timestamp);
        if (!i.known) {
            i.known = true;
            _collections.push(collection);
        }
        emit CollectionListed(collection);
    }

    /// @notice Stop new coins from pairing with `collection`. Existing coins are unaffected.
    function delistCollection(address collection) external onlyOwner {
        Info storage i = _info[collection];
        if (!i.listed) revert NotListed();
        i.listed = false;
        emit CollectionDelisted(collection);
    }

    // ---------------------------------------------------------------- launcher

    /// @notice Record the shared vault for `collection`. Callable once per collection, by the Launcher only.
    function registerVault(address collection, address vault) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (vault == address(0)) revert ZeroAddress();
        Info storage i = _info[collection];
        if (!i.known) revert NotListed();
        if (i.vault != address(0)) revert VaultAlreadyRegistered();
        i.vault = vault;
        emit VaultRegistered(collection, vault);
    }

    // ---------------------------------------------------------------- views

    function isListed(address collection) external view returns (bool) {
        return _info[collection].listed;
    }

    function vaultOf(address collection) external view returns (address) {
        return _info[collection].vault;
    }

    function infoOf(address collection) external view returns (Info memory) {
        return _info[collection];
    }

    function collectionCount() external view returns (uint256) {
        return _collections.length;
    }

    function collectionAt(uint256 index) external view returns (address) {
        return _collections[index];
    }

    /// @notice A page of collections (listed or not) for off-chain indexing.
    function collectionsPage(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _collections.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 k = offset; k < end; k++) {
            page[k - offset] = _collections[k];
        }
    }

    // ---------------------------------------------------------------- internal

    function _isErc721(address collection) private view returns (bool) {
        if (collection.code.length == 0) return false;
        try IERC165(collection).supportsInterface(ERC721_INTERFACE_ID) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }
}
