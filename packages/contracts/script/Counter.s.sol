// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Script} from "forge-std/Script.sol";
import {Counter} from "../src/Counter.sol";

/// @title CounterScript
/// @notice Deploys Counter with the broadcaster set by `--private-key` or `--account`.
contract CounterScript is Script {
    /// @notice Deploys a new Counter.
    /// @return counter The deployed Counter.
    function run() external returns (Counter counter) {
        vm.startBroadcast();
        counter = new Counter();
        vm.stopBroadcast();
    }
}
