// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {RatingController} from "../src/RatingController.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

/// @title DeployRatingController
/// @author verisci
/// @notice Deploys RatingController with the config of the current chain and `DEPLOY_ENV`. The
///         account that signs the broadcast becomes the owner (ADR 0019).
contract DeployRatingController is Script {
    /// @notice Reads the config, then deploys from it.
    /// @return controller The deployed contract.
    /// @return helperConfig The config it was deployed from.
    function run() external returns (RatingController controller, HelperConfig helperConfig) {
        // Created before the broadcast, so only the RatingController goes on chain.
        helperConfig = new HelperConfig();
        controller = deploy(helperConfig.getConfig());
    }

    /// @notice Deploys a RatingController from a config, signed by the broadcasting account.
    /// @param config The oracle and pending cap to pass to the constructor.
    /// @return controller The deployed contract.
    function deploy(HelperConfig.NetworkConfig memory config) public returns (RatingController controller) {
        vm.startBroadcast();
        controller = new RatingController(config.oracleAgent, config.maxPendingPerRequester);
        vm.stopBroadcast();
    }
}
