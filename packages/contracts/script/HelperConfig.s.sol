// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";

/// @title HelperConfig
/// @author verisci
/// @notice The RatingController settings for each environment: local Anvil, and staging and
///         production on Base Sepolia. Both Base Sepolia environments share one chain id, so
///         `DEPLOY_ENV` picks one there (ADR 0005).
contract HelperConfig is Script {
    /// @notice What the deploy script passes to the RatingController constructor.
    /// @param oracleAgent The address allowed to fulfil and cancel requests.
    /// @param maxPendingPerRequester The per-requester pending cap (ADR 0015).
    struct NetworkConfig {
        address oracleAgent;
        uint8 maxPendingPerRequester;
    }

    /// @notice The chain id has no config.
    /// @param chainId The chain id that was asked for.
    error UnsupportedChain(uint256 chainId);

    /// @notice `DEPLOY_ENV` is neither `staging` nor `production`.
    /// @param deployEnv The value that was given, empty when unset.
    error UnknownDeployEnv(string deployEnv);

    /// @notice Chain id of a local Anvil node.
    uint256 public constant LOCAL_CHAIN_ID = 31_337;

    /// @notice Chain id of Base Sepolia, where staging and production run.
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84_532;

    /// @notice Pending cap for every environment.
    uint8 public constant MAX_PENDING_PER_REQUESTER = 3;

    /// @notice Public address of Anvil's second default account, the oracle on a local node.
    address public constant ANVIL_ORACLE = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    /// @notice Public address of staging's oracle wallet. Its private key stays off the repo; the
    ///         agents on `develop` sign with it (ADR 0019). It differs from the deployer, who
    ///         becomes the owner (ADR 0030).
    address public constant STAGING_ORACLE = 0xE7899a249C8C21F334BDA14D1d861116Aa048F68;

    /// @notice Public address of production's oracle wallet. Its private key stays off the repo;
    ///         the agents on `main` sign with it (ADR 0019). It differs from the deployer, who
    ///         becomes the owner (ADR 0030). Zero until the wallet exists, which makes a deploy
    ///         revert.
    address public constant PRODUCTION_ORACLE = address(0);

    /// @notice The config for the current chain, and on Base Sepolia for `DEPLOY_ENV`.
    /// @return config The constructor arguments to deploy with.
    function getConfig() external view returns (NetworkConfig memory config) {
        return getConfigFor(block.chainid, vm.envOr("DEPLOY_ENV", string("")));
    }

    /// @notice The config for a chain id and, on Base Sepolia, an environment name.
    /// @param chainId The chain to deploy to.
    /// @param deployEnv `staging` or `production` on Base Sepolia; ignored on Anvil.
    /// @return config The constructor arguments to deploy with.
    function getConfigFor(uint256 chainId, string memory deployEnv) public pure returns (NetworkConfig memory config) {
        if (chainId == LOCAL_CHAIN_ID) return NetworkConfig(ANVIL_ORACLE, MAX_PENDING_PER_REQUESTER);
        if (chainId != BASE_SEPOLIA_CHAIN_ID) revert UnsupportedChain(chainId);

        bytes32 envHash = keccak256(bytes(deployEnv));
        if (envHash == keccak256("staging")) return NetworkConfig(STAGING_ORACLE, MAX_PENDING_PER_REQUESTER);
        if (envHash == keccak256("production")) return NetworkConfig(PRODUCTION_ORACLE, MAX_PENDING_PER_REQUESTER);
        revert UnknownDeployEnv(deployEnv);
    }
}
