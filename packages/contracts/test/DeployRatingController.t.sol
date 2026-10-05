// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {DeployRatingController} from "../script/DeployRatingController.s.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";
import {RatingController} from "../src/RatingController.sol";
import {IRatingController} from "../src/interfaces/IRatingController.sol";

/// @title DeployRatingControllerTest
/// @notice Tests for the deploy script and the per-environment config it reads.
contract DeployRatingControllerTest is Test {
    /// Ethereum mainnet, a chain HelperConfig has no config for.
    uint256 internal constant MAINNET_CHAIN_ID = 1;

    DeployRatingController internal deployer;
    HelperConfig internal helperConfig;

    function setUp() public {
        deployer = new DeployRatingController();
        helperConfig = new HelperConfig();
    }

    function test_Run_DeploysFromLocalConfig() public {
        (RatingController controller, HelperConfig usedConfig) = deployer.run();
        HelperConfig.NetworkConfig memory config = usedConfig.getConfig();

        assertEq(controller.oracleAgent(), config.oracleAgent);
        assertEq(controller.maxPendingPerRequester(), config.maxPendingPerRequester);
        assertEq(controller.owner(), DEFAULT_SENDER);
        assertFalse(controller.paused());
    }

    function test_GetConfig_LocalUsesAnvilOracle() public view {
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        assertEq(config.oracleAgent, helperConfig.ANVIL_ORACLE());
        assertEq(config.maxPendingPerRequester, helperConfig.MAX_PENDING_PER_REQUESTER());
    }

    function test_GetConfigFor_Staging() public view {
        HelperConfig.NetworkConfig memory config =
            helperConfig.getConfigFor(helperConfig.BASE_SEPOLIA_CHAIN_ID(), "staging");
        assertEq(config.oracleAgent, helperConfig.STAGING_ORACLE());
        assertEq(config.maxPendingPerRequester, helperConfig.MAX_PENDING_PER_REQUESTER());
    }

    function test_GetConfigFor_Production() public view {
        HelperConfig.NetworkConfig memory config =
            helperConfig.getConfigFor(helperConfig.BASE_SEPOLIA_CHAIN_ID(), "production");
        assertEq(config.oracleAgent, helperConfig.PRODUCTION_ORACLE());
        assertEq(config.maxPendingPerRequester, helperConfig.MAX_PENDING_PER_REQUESTER());
    }

    function test_GetConfigFor_RevertsOnUnsetDeployEnv() public {
        uint256 chainId = helperConfig.BASE_SEPOLIA_CHAIN_ID();
        vm.expectRevert(abi.encodeWithSelector(HelperConfig.UnknownDeployEnv.selector, ""));
        helperConfig.getConfigFor(chainId, "");
    }

    function testFuzz_GetConfigFor_RevertsOnUnknownDeployEnv(string calldata deployEnv) public {
        vm.assume(keccak256(bytes(deployEnv)) != keccak256("staging"));
        vm.assume(keccak256(bytes(deployEnv)) != keccak256("production"));
        uint256 chainId = helperConfig.BASE_SEPOLIA_CHAIN_ID();
        vm.expectRevert(abi.encodeWithSelector(HelperConfig.UnknownDeployEnv.selector, deployEnv));
        helperConfig.getConfigFor(chainId, deployEnv);
    }

    function testFuzz_GetConfigFor_RevertsOnUnsupportedChain(uint256 chainId) public {
        vm.assume(chainId != helperConfig.LOCAL_CHAIN_ID() && chainId != helperConfig.BASE_SEPOLIA_CHAIN_ID());
        vm.expectRevert(abi.encodeWithSelector(HelperConfig.UnsupportedChain.selector, chainId));
        helperConfig.getConfigFor(chainId, "staging");
    }

    function test_GetConfig_RevertsOnUnsupportedChain() public {
        vm.chainId(MAINNET_CHAIN_ID);
        vm.expectRevert(abi.encodeWithSelector(HelperConfig.UnsupportedChain.selector, MAINNET_CHAIN_ID));
        helperConfig.getConfig();
    }

    function test_Deploy_RevertsWhenOracleIsTheDeployer() public {
        HelperConfig.NetworkConfig memory config = HelperConfig.NetworkConfig({
            oracleAgent: DEFAULT_SENDER, maxPendingPerRequester: helperConfig.MAX_PENDING_PER_REQUESTER()
        });
        vm.expectRevert(IRatingController.SameOwnerAndOracle.selector);
        deployer.deploy(config);
    }

    function test_Deploy_RevertsOnZeroOracle() public {
        HelperConfig.NetworkConfig memory config = HelperConfig.NetworkConfig({
            oracleAgent: address(0), maxPendingPerRequester: helperConfig.MAX_PENDING_PER_REQUESTER()
        });
        vm.expectRevert(IRatingController.ZeroAddress.selector);
        deployer.deploy(config);
    }
}
