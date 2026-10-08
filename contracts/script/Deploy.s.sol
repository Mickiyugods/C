// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CollectionRegistry} from "../src/CollectionRegistry.sol";
import {RaffleDistributor} from "../src/RaffleDistributor.sol";
import {Launcher} from "../src/Launcher.sol";
import {VaultFactory, RouterFactory} from "../src/Factories.sol";

/// @notice Deploys the whole Curato system to Robinhood Chain (or a fork of it).
///
/// Required environment variables:
///   TREASURY          address that receives 20% of every harvest. IMMUTABLE once deployed.
///   KEEPER            address of the keeper bot (posts price caps and raffle snapshots). Replaceable.
///   REGISTRY_OWNER    address that will own the CollectionRegistry (must accept ownership afterwards).
/// Optional:
///   VAULT_HARD_MAX_CAP_WEI   absolute ceiling for one NFT price (default 1 ether). IMMUTABLE.
///   VAULT_DAILY_LIMIT_WEI    most a vault may spend per day (default 2 ether). IMMUTABLE.
///   DEPLOY_TAG               suffix of the output file in deployments/ (default "latest").
///
/// Dry run against a fork:   forge script script/Deploy.s.sol --fork-url $RPC
/// Real broadcast:           forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key ...
///
/// Never broadcast to mainnet before an independent audit.
contract Deploy is Script {
    // Pons V2 and Seaport 1.6 on Robinhood Chain (4663), verified in docs/pons-notes.md.
    address constant PONS_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant FEE_ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    address constant MEME_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;

    struct Config {
        address treasury;
        address keeper;
        address registryOwner;
        uint256 hardMaxCap;
        uint256 dailyLimit;
    }

    struct Deployed {
        CollectionRegistry registry;
        RaffleDistributor distributor;
        VaultFactory vaultFactory;
        RouterFactory routerFactory;
        Launcher launcher;
    }

    function run() external {
        Config memory c = _config();
        require(PONS_FACTORY.code.length > 0 && SEAPORT.code.length > 0, "Pons or Seaport missing on this chain");

        vm.startBroadcast();
        Deployed memory d = _deploy(c, msg.sender);
        vm.stopBroadcast();

        _report(c, d);
    }

    function _config() internal view returns (Config memory c) {
        c.treasury = vm.envAddress("TREASURY");
        c.keeper = vm.envAddress("KEEPER");
        c.registryOwner = vm.envAddress("REGISTRY_OWNER");
        c.hardMaxCap = vm.envOr("VAULT_HARD_MAX_CAP_WEI", uint256(1 ether));
        c.dailyLimit = vm.envOr("VAULT_DAILY_LIMIT_WEI", uint256(2 ether));
        require(c.treasury != address(0) && c.keeper != address(0) && c.registryOwner != address(0), "zero address");
    }

    function _deploy(Config memory c, address deployer) internal returns (Deployed memory d) {
        // The deployer owns the registry only long enough to wire it, then hands it over.
        d.registry = new CollectionRegistry(deployer);
        d.distributor = new RaffleDistributor(address(d.registry));
        d.vaultFactory = new VaultFactory();
        d.routerFactory = new RouterFactory();
        d.launcher = new Launcher(
            PONS_FACTORY,
            address(d.registry),
            SEAPORT,
            address(d.distributor),
            FEE_ESCROW,
            MEME_HOOK,
            c.treasury,
            address(d.vaultFactory),
            address(d.routerFactory),
            c.hardMaxCap,
            c.dailyLimit
        );

        d.registry.setLauncher(address(d.launcher));
        d.registry.setKeeper(c.keeper);
        if (c.registryOwner != deployer) d.registry.transferOwnership(c.registryOwner);
    }

    function _report(Config memory c, Deployed memory d) internal {
        console.log("chainId            ", block.chainid);
        console.log("CollectionRegistry ", address(d.registry));
        console.log("RaffleDistributor  ", address(d.distributor));
        console.log("Launcher           ", address(d.launcher));
        console.log("VaultFactory       ", address(d.vaultFactory));
        console.log("RouterFactory      ", address(d.routerFactory));
        console.log("treasury           ", c.treasury);
        console.log("keeper             ", c.keeper);
        console.log("registry owner     ", c.registryOwner);

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "registry", address(d.registry));
        vm.serializeAddress(key, "distributor", address(d.distributor));
        vm.serializeAddress(key, "launcher", address(d.launcher));
        vm.serializeAddress(key, "vaultFactory", address(d.vaultFactory));
        vm.serializeAddress(key, "routerFactory", address(d.routerFactory));
        vm.serializeAddress(key, "treasury", c.treasury);
        string memory out = vm.serializeAddress(key, "keeper", c.keeper);
        string memory file = string.concat("./deployments/", vm.toString(block.chainid), "-", vm.envOr("DEPLOY_TAG", string("latest")), ".json");
        vm.writeJson(out, file);
    }
}
