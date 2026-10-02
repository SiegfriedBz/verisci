// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title Counter
/// @author verisci
/// @notice Placeholder contract that proves the Foundry toolchain end to end.
/// @dev Replace with the first real contract.
contract Counter {
    /// @notice The current count.
    uint256 public number;

    /// @notice Emitted whenever the count changes.
    /// @param number The new count.
    event NumberChanged(uint256 number);

    /// @notice Sets the count to `newNumber`.
    /// @param newNumber The new count.
    function setNumber(uint256 newNumber) external {
        number = newNumber;
        emit NumberChanged(newNumber);
    }

    /// @notice Adds one to the count.
    function increment() external {
        number++;
        emit NumberChanged(number);
    }
}
