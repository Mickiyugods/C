// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vault} from "./Vault.sol";
import {FeeRouter} from "./FeeRouter.sol";

/// @notice Holds the creation code of Vault so the Launcher stays under the 24,576 byte contract size
///         limit. Stateless and permissionless: a vault it creates only matters once the Launcher registers
///         it, and the registry accepts vaults from the Launcher alone.
contract VaultFactory {
    function create(
        address collection,
        address registry,
        address seaport,
        address distributor,
        address launcher,
        uint256 hardMaxCap,
        uint256 dailyLimit
    ) external returns (address) {
        return address(new Vault(collection, registry, seaport, distributor, launcher, hardMaxCap, dailyLimit));
    }
}

/// @notice Same idea for FeeRouter.
contract RouterFactory {
    function create(address launcher, address vault, address treasury, address escrow, address hook)
        external
        returns (address)
    {
        return address(new FeeRouter(launcher, vault, treasury, escrow, hook));
    }
}
