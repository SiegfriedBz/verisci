// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {RatingController} from "../../src/RatingController.sol";
import {IRatingController} from "../../src/interfaces/IRatingController.sol";

/// @title RatingHandler
/// @notice Drives RatingController through random requests, fulfils, cancels and cap changes
///         for the invariant tests, and records ghost state to check against.
contract RatingHandler is CommonBase, StdUtils {
    RatingController internal immutable controller;
    address internal immutable owner;
    address internal immutable oracle;

    address[] internal _actors;
    bytes32[] internal _ids;

    /// @notice What a request looked like when it left `Pending`.
    struct Settled {
        bool recorded;
        IRatingController.Status status;
        uint8 score;
        bytes32 rKaHash;
    }

    mapping(bytes32 id => Settled settled) internal _settled;

    /// @notice Number of fulfils or cancels that succeeded on an already settled request.
    uint256 public settledTwice;

    string[3] internal _targets = ["did:dkg:t/0x1/1", "did:dkg:t/0x1/2", "did:dkg:t/0x1/3"];

    constructor(RatingController controller_, address owner_, address oracle_) {
        controller = controller_;
        owner = owner_;
        oracle = oracle_;
        for (uint160 i = 1; i <= 5; ++i) {
            _actors.push(address(0xA000 + i));
        }
    }

    // --- actions ---

    function request(uint256 actorSeed, uint256 targetSeed) external {
        address actor = _actors[actorSeed % _actors.length];
        if (controller.pendingCountOf(actor) >= controller.maxPendingPerRequester()) return;
        vm.warp(block.timestamp + 1);
        vm.prank(actor);
        _ids.push(controller.requestPhase1(_targets[targetSeed % _targets.length]));
    }

    function fulfil(uint256 idSeed, uint8 score, uint256 rKaSeed) external {
        bytes32 id = _anyId(idSeed);
        if (id == bytes32(0)) return;
        string memory rKa = string.concat("did:dkg:r/0x2/", vm.toString(rKaSeed));
        vm.prank(oracle);
        // Invalid scores and settled ids must revert and leave state untouched.
        try controller.fulfilPhase1(id, score, rKa) {
            _record(id, IRatingController.Status.Fulfilled, score, rKa);
        } catch {}
    }

    function cancelByOracle(uint256 idSeed, bool invalidTarget) external {
        bytes32 id = _anyId(idSeed);
        if (id == bytes32(0)) return;
        IRatingController.CancelReason reason =
            invalidTarget ? IRatingController.CancelReason.InvalidTarget : IRatingController.CancelReason.Expired;
        vm.prank(oracle);
        try controller.cancelRequest(id, reason) {
            _record(id, IRatingController.Status.Cancelled, 0, "");
        } catch {}
    }

    function setCap(uint256 max) external {
        vm.prank(owner);
        controller.setMaxPendingPerRequester(uint8(bound(max, 1, 5)));
    }

    // --- ghost accessors ---

    function idCount() external view returns (uint256) {
        return _ids.length;
    }

    function idAt(uint256 i) external view returns (bytes32) {
        return _ids[i];
    }

    function actorCount() external view returns (uint256) {
        return _actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return _actors[i];
    }

    function settled(bytes32 id) external view returns (Settled memory) {
        return _settled[id];
    }

    // --- internals ---

    /// @dev Any id made so far, pending or settled, so settled ones get retried too.
    function _anyId(uint256 seed) internal view returns (bytes32) {
        if (_ids.length == 0) return bytes32(0);
        return _ids[seed % _ids.length];
    }

    /// @dev Records what a successful settle should have stored; settling twice is a violation.
    function _record(bytes32 id, IRatingController.Status status, uint8 score, string memory rKa) internal {
        if (_settled[id].recorded) {
            ++settledTwice;
            return;
        }
        _settled[id] = Settled(true, status, score, keccak256(bytes(rKa)));
    }
}
