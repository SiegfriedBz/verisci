// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {DeployRatingController} from "../script/DeployRatingController.s.sol";
import {RatingController} from "../src/RatingController.sol";
import {IRatingController} from "../src/interfaces/IRatingController.sol";
import {RatingHandler} from "./handlers/RatingHandler.sol";

/// @title RatingControllerInvariantTest
/// @notice Invariants of RatingController's pending set, caps and settled requests.
contract RatingControllerInvariantTest is Test {
    RatingController internal controller;
    RatingHandler internal handler;

    function setUp() public {
        (controller,) = new DeployRatingController().run();
        handler = new RatingHandler(controller, controller.owner(), controller.oracleAgent());
        targetContract(address(handler));
    }

    /// The pending set holds exactly the requests whose status is `Pending`.
    function invariant_PendingSetMatchesPendingStatus() public view {
        uint256 pendingByStatus;
        for (uint256 i; i < handler.idCount(); ++i) {
            if (controller.getRatingRequest(handler.idAt(i)).status == IRatingController.Status.Pending) {
                ++pendingByStatus;
            }
        }
        assertEq(controller.pendingCount(), pendingByStatus);

        bytes32[] memory pending = controller.pendingRequestIds(0, type(uint256).max);
        for (uint256 i; i < pending.length; ++i) {
            assertEq(uint8(controller.getRatingRequest(pending[i]).status), uint8(IRatingController.Status.Pending));
        }
    }

    /// The sum of every requester's pending count equals the pending set's size.
    function invariant_PendingCountsSumToSetSize() public view {
        uint256 sum;
        for (uint256 i; i < handler.actorCount(); ++i) {
            sum += controller.pendingCountOf(handler.actorAt(i));
        }
        assertEq(sum, controller.pendingCount());
    }

    /// A request that left `Pending` never returns to it, and its score and R-KA never change.
    function invariant_SettledRequestsNeverChange() public view {
        assertEq(handler.settledTwice(), 0);
        for (uint256 i; i < handler.idCount(); ++i) {
            bytes32 id = handler.idAt(i);
            RatingHandler.Settled memory s = handler.settled(id);
            if (!s.recorded) continue;
            IRatingController.RatingRequest memory r = controller.getRatingRequest(id);
            assertEq(uint8(r.status), uint8(s.status));
            assertEq(r.phase1Score, s.score);
            assertEq(keccak256(bytes(r.rKaUal)), s.rKaHash);
        }
    }

    /// While paused, no request is added and the nonce does not move.
    function invariant_PausedTakesNoRequests() public view {
        assertEq(handler.requestedWhilePaused(), 0);
        assertEq(handler.nonceMovedWhilePaused(), 0);
    }

    /// The owner and the oracle are never the same address (ADR 0030).
    function invariant_OwnerIsNeverOracle() public view {
        assertTrue(controller.owner() != controller.oracleAgent());
    }

    /// Every stored score is at most 100.
    function invariant_ScoresAtMost100() public view {
        for (uint256 i; i < handler.idCount(); ++i) {
            assertLe(controller.getRatingRequest(handler.idAt(i)).phase1Score, 100);
        }
    }
}
