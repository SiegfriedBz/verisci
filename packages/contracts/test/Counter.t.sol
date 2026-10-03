// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

/// @title CounterTest
/// @notice Unit and fuzz tests for Counter.
contract CounterTest is Test {
    Counter internal counter;

    function setUp() public {
        counter = new Counter();
        counter.setNumber(0);
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
    }

    function test_IncrementEmitsNumberChanged() public {
        vm.expectEmit(address(counter));
        emit Counter.NumberChanged(1);
        counter.increment();
    }

    function testFuzz_SetNumber(uint256 x) public {
        counter.setNumber(x);
        assertEq(counter.number(), x);
    }
}
