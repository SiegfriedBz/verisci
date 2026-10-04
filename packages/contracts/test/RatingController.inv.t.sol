// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {RatingController} from "../src/RatingController.sol";
import {IRatingController} from "../src/interfaces/IRatingController.sol";
import {RatingHandler} from "./handlers/RatingHandler.sol";

/// @title RatingControllerInvariantTest
/// @notice Invariants of RatingController's pending set, caps and settled requests.
contract RatingControllerInvariantTest is Test {
    RatingController internal controller;
    RatingHandler internal handler;

    function setUp() public {
        address owner = makeAddr("owner");
        address oracle = makeAddr("oracle");
        vm.prank(owner);
        controller = new RatingController(oracle, 3);
        handler = new RatingHandler(controller, owner, oracle);
        targetContract(address(handler));
    }

    /// The pending set holds exactly the requests whose status is `Pending`.
    function invariant_PendingSetMatchesPendingStatus() public view {
        uint256 pendingByStatus;
        for (uint256 i; i < handler.idCount(); ++i) {
            if (controller.getRequest(handler.idAt(i)).status == IRatingController.Status.Pending) {
                ++pendingByStatus;
            }
        }
        assertEq(controller.pendingCount(), pendingByStatus);

        bytes32[] memory pending = controller.pendingRequestIds(0, type(uint256).max);
        for (uint256 i; i < pending.length; ++i) {
            assertEq(uint8(controller.getRequest(pending[i]).status), uint8(IRatingController.Status.Pending));
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
            IRatingController.Request memory r = controller.getRequest(id);
            assertEq(uint8(r.status), uint8(s.status));
            assertEq(r.phase1Score, s.score);
            assertEq(keccak256(bytes(r.rKaUal)), s.rKaHash);
        }
    }

    /// Every stored score is at most 100.
    function invariant_ScoresAtMost100() public view {
        for (uint256 i; i < handler.idCount(); ++i) {
            assertLe(controller.getRequest(handler.idAt(i)).phase1Score, 100);
        }
    }
}
