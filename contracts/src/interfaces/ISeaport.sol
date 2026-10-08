// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal slice of Seaport 1.6 (0x0000000000000068F116a894984e2DB1123eB395). Struct layouts match
///      the deployed contract.
enum ItemType {
    NATIVE,
    ERC20,
    ERC721,
    ERC1155,
    ERC721_WITH_CRITERIA,
    ERC1155_WITH_CRITERIA
}

enum OrderType {
    FULL_OPEN,
    PARTIAL_OPEN,
    FULL_RESTRICTED,
    PARTIAL_RESTRICTED,
    CONTRACT
}

struct OfferItem {
    ItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
}

struct ConsiderationItem {
    ItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
    address payable recipient;
}

struct OrderParameters {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    OrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 totalOriginalConsiderationItems;
}

struct Order {
    OrderParameters parameters;
    bytes signature;
}

struct OrderComponents {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    OrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 counter;
}

interface ISeaport {
    function fulfillOrder(Order calldata order, bytes32 fulfillerConduitKey) external payable returns (bool fulfilled);

    function getOrderHash(OrderComponents calldata order) external view returns (bytes32);

    function getCounter(address offerer) external view returns (uint256);

    function information() external view returns (string memory version, bytes32 domainSeparator, address conduitController);
}
