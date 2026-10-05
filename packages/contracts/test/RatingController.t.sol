// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";
import {DeployRatingController} from "../script/DeployRatingController.s.sol";
import {RatingController} from "../src/RatingController.sol";
import {IRatingController} from "../src/interfaces/IRatingController.sol";

/// @title RatingControllerTest
/// @notice Unit and fuzz tests for RatingController.
contract RatingControllerTest is Test {
    RatingController internal controller;

    address internal owner;
    address internal oracle;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    string internal constant TARGET = "did:dkg:otp:20430/0xabc/1";
    string internal constant RKA = "did:dkg:otp:20430/0xabc/2";

    function setUp() public {
        (controller,) = new DeployRatingController().run();
        owner = controller.owner();
        oracle = controller.oracleAgent();
    }

    // --- helpers ---

    function _expectedId(uint256 chainId, address deployedAt, uint256 nonce, address requester, string memory targetUal)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(chainId, deployedAt, nonce, requester, keccak256(bytes(targetUal))));
    }

    function _requestBy(address requester) internal returns (bytes32) {
        vm.prank(requester);
        return controller.requestPhase1(TARGET);
    }

    function _fulfil(bytes32 id) internal {
        vm.prank(oracle);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function _ualOfLength(uint256 length) internal pure returns (string memory) {
        bytes memory b = new bytes(length);
        for (uint256 i; i < length; ++i) {
            b[i] = "a";
        }
        return string(b);
    }

    // --- constructor ---

    function test_Constructor_SetsOwnerOracleAndCap() public view {
        assertEq(controller.owner(), owner);
        assertEq(controller.oracleAgent(), oracle);
        assertEq(controller.maxPendingPerRequester(), 3);
        assertEq(controller.nonce(), 0);
    }

    function test_Constructor_EmitsConfig() public {
        vm.expectEmit();
        emit IRatingController.OracleAgentUpdated(oracle);
        vm.expectEmit();
        emit IRatingController.MaxPendingPerRequesterUpdated(3);
        new RatingController(oracle, 3);
    }

    function test_Constructor_RevertsOnZeroCap() public {
        vm.expectRevert(IRatingController.InvalidCap.selector);
        new RatingController(oracle, 0);
    }

    function test_Constructor_RevertsOnZeroOracle() public {
        vm.expectRevert(IRatingController.ZeroAddress.selector);
        new RatingController(address(0), 3);
    }

    // --- requestPhase1 ---

    function test_Request_StoresPendingRequest() public {
        vm.warp(1_700_000_000);
        bytes32 id = _requestBy(alice);

        IRatingController.RatingRequest memory r = controller.getRatingRequest(id);
        assertEq(r.requester, alice);
        assertEq(r.requestedAt, 1_700_000_000);
        assertEq(uint8(r.status), uint8(IRatingController.Status.Pending));
        assertEq(uint8(r.cancelReason), uint8(IRatingController.CancelReason.None));
        assertEq(r.phase1Score, 0);
        assertEq(r.targetUal, TARGET);
        assertEq(r.rKaUal, "");

        assertEq(controller.nonce(), 1);
        assertEq(controller.pendingCountOf(alice), 1);
        assertEq(controller.pendingCount(), 1);
        assertEq(controller.pendingRequestIds(0, 10)[0], id);
        assertEq(controller.requestCountOf(TARGET), 1);
        assertEq(controller.requestIdsOf(TARGET, 0, 10)[0], id);
    }

    function test_Request_EmitsPhase1Requested() public {
        vm.warp(1_700_000_000);
        bytes32 expected = _expectedId(block.chainid, address(controller), 0, alice, TARGET);
        vm.expectEmit(address(controller));
        emit IRatingController.Phase1Requested(expected, alice, keccak256(bytes(TARGET)), TARGET, 1_700_000_000);
        _requestBy(alice);
    }

    function test_Request_SameRequesterAndTargetGetDistinctIds() public {
        bytes32 first = _requestBy(alice);
        bytes32 second = _requestBy(alice);
        assertNotEq(first, second);
        assertEq(controller.requestCountOf(TARGET), 2);
    }

    function testFuzz_Request_IdMatchesScheme(address requester, string calldata targetUal, uint64 chainId) public {
        vm.assume(bytes(targetUal).length > 0);
        vm.chainId(chainId);
        uint256 nonce = controller.nonce();

        vm.prank(requester);
        bytes32 id = controller.requestPhase1(targetUal);

        assertEq(id, _expectedId(chainId, address(controller), nonce, requester, targetUal));
    }

    function testFuzz_Request_IdsDifferAcrossChainIds(uint64 chainA, uint64 chainB) public {
        vm.assume(chainA != chainB);
        uint256 snapshot = vm.snapshotState();
        vm.chainId(chainA);
        bytes32 idA = _requestBy(alice);
        vm.revertToState(snapshot);
        vm.chainId(chainB);
        bytes32 idB = _requestBy(alice);
        assertNotEq(idA, idB);
    }

    function testFuzz_Request_IdsDifferAcrossDeployments(address atA, address atB) public {
        vm.assume(atA != atB);
        assumeNotPrecompile(atA);
        assumeNotPrecompile(atB);
        assumeNotForgeAddress(atA);
        assumeNotForgeAddress(atB);
        vm.assume(atA.code.length == 0 && atB.code.length == 0);

        deployCodeTo("RatingController.sol:RatingController", abi.encode(oracle, 3), atA);
        deployCodeTo("RatingController.sol:RatingController", abi.encode(oracle, 3), atB);

        vm.prank(alice);
        bytes32 idA = RatingController(atA).requestPhase1(TARGET);
        vm.prank(alice);
        bytes32 idB = RatingController(atB).requestPhase1(TARGET);
        assertNotEq(idA, idB);
    }

    function test_Request_RevertsOnEmptyTarget() public {
        vm.expectRevert(IRatingController.EmptyTargetUal.selector);
        controller.requestPhase1("");
    }

    function testFuzz_Request_AcceptsAnyNonEmptyTarget(uint256 length) public {
        length = bound(length, 1, 2048);
        string memory ual = _ualOfLength(length);
        bytes32 id = controller.requestPhase1(ual);
        assertEq(controller.getRatingRequest(id).targetUal, ual);
    }

    function test_Request_RevertsPastCapUntilOneSettles() public {
        bytes32 first = _requestBy(alice);
        _requestBy(alice);
        _requestBy(alice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRatingController.TooManyPending.selector, 3, 3));
        controller.requestPhase1(TARGET);

        // Each requester has their own cap.
        _requestBy(bob);

        _fulfil(first);
        _requestBy(alice);
        assertEq(controller.pendingCountOf(alice), 3);
    }

    // --- fulfilPhase1 ---

    function testFuzz_Fulfil_RecordsScoreAndRKa(uint8 score) public {
        score = uint8(bound(score, 0, 100));
        bytes32 id = _requestBy(alice);

        vm.expectEmit(address(controller));
        emit IRatingController.Phase1Fulfilled(id, score, RKA);
        vm.prank(oracle);
        controller.fulfilPhase1(id, score, RKA);

        IRatingController.RatingRequest memory r = controller.getRatingRequest(id);
        assertEq(uint8(r.status), uint8(IRatingController.Status.Fulfilled));
        assertEq(r.phase1Score, score);
        assertEq(r.rKaUal, RKA);
        assertEq(controller.pendingCount(), 0);
        assertEq(controller.pendingCountOf(alice), 0);
    }

    function testFuzz_Fulfil_RevertsWhenNotOracle(address caller) public {
        vm.assume(caller != oracle);
        bytes32 id = _requestBy(alice);
        vm.prank(caller);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function testFuzz_Fulfil_RevertsOnUnknownRequest(bytes32 id) public {
        vm.prank(oracle);
        vm.expectRevert(IRatingController.UnknownRequest.selector);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function test_Fulfil_RevertsWhenNotPending() public {
        bytes32 id = _requestBy(alice);
        _fulfil(id);
        vm.prank(oracle);
        vm.expectRevert(
            abi.encodeWithSelector(IRatingController.NotPending.selector, IRatingController.Status.Fulfilled)
        );
        controller.fulfilPhase1(id, 7, "other");
    }

    function test_Fulfil_RevertsWhenCancelled() public {
        bytes32 id = _requestBy(alice);
        vm.startPrank(oracle);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
        vm.expectRevert(
            abi.encodeWithSelector(IRatingController.NotPending.selector, IRatingController.Status.Cancelled)
        );
        controller.fulfilPhase1(id, 42, RKA);
        vm.stopPrank();
    }

    function testFuzz_Fulfil_RevertsOnScoreAbove100(uint8 score) public {
        score = uint8(bound(score, 101, 255));
        bytes32 id = _requestBy(alice);
        vm.prank(oracle);
        vm.expectRevert(IRatingController.InvalidScore.selector);
        controller.fulfilPhase1(id, score, RKA);
    }

    function test_Fulfil_RevertsOnEmptyRKa() public {
        bytes32 id = _requestBy(alice);
        vm.prank(oracle);
        vm.expectRevert(IRatingController.EmptyRKaUal.selector);
        controller.fulfilPhase1(id, 42, "");
    }

    // --- cancelRequest ---

    function _assertCancelled(bytes32 id, IRatingController.CancelReason reason) internal view {
        IRatingController.RatingRequest memory r = controller.getRatingRequest(id);
        assertEq(uint8(r.status), uint8(IRatingController.Status.Cancelled));
        assertEq(uint8(r.cancelReason), uint8(reason));
        assertEq(controller.pendingCount(), 0);
        assertEq(controller.pendingCountOf(alice), 0);
    }

    function test_Cancel_ByOracleWithExpired() public {
        bytes32 id = _requestBy(alice);
        vm.expectEmit(address(controller));
        emit IRatingController.RequestCancelled(id, IRatingController.CancelReason.Expired);
        vm.prank(oracle);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
        _assertCancelled(id, IRatingController.CancelReason.Expired);
    }

    function test_Cancel_ByOracleWithInvalidTarget() public {
        bytes32 id = _requestBy(alice);
        vm.expectEmit(address(controller));
        emit IRatingController.RequestCancelled(id, IRatingController.CancelReason.InvalidTarget);
        vm.prank(oracle);
        controller.cancelRequest(id, IRatingController.CancelReason.InvalidTarget);
        _assertCancelled(id, IRatingController.CancelReason.InvalidTarget);
    }

    function testFuzz_Cancel_RevertsForAnyoneButTheOracle(address caller, uint8 rawReason) public {
        vm.assume(caller != oracle);
        IRatingController.CancelReason reason = IRatingController.CancelReason(bound(rawReason, 0, 2));
        bytes32 id = _requestBy(alice);
        vm.prank(caller);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.cancelRequest(id, reason);
    }

    function test_Cancel_RevertsForOwnerAndRequester() public {
        bytes32 id = _requestBy(alice);
        vm.prank(owner);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
        vm.prank(alice);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
    }

    function test_Cancel_RevertsWhenOracleGivesNoReason() public {
        bytes32 id = _requestBy(alice);
        vm.prank(oracle);
        vm.expectRevert(IRatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, IRatingController.CancelReason.None);
    }

    function test_Cancel_OwnerSwapsOracleInAnEmergency() public {
        bytes32 id = _requestBy(alice);
        address emergencyOracle = makeAddr("emergency oracle");
        vm.prank(owner);
        controller.setOracleAgent(emergencyOracle);
        vm.prank(emergencyOracle);
        controller.cancelRequest(id, IRatingController.CancelReason.InvalidTarget);
        _assertCancelled(id, IRatingController.CancelReason.InvalidTarget);
    }

    function test_Cancel_RevertsWhenNotPending() public {
        bytes32 id = _requestBy(alice);
        _fulfil(id);
        vm.prank(oracle);
        vm.expectRevert(
            abi.encodeWithSelector(IRatingController.NotPending.selector, IRatingController.Status.Fulfilled)
        );
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
    }

    function testFuzz_Cancel_RevertsOnUnknownRequest(bytes32 id) public {
        vm.prank(oracle);
        vm.expectRevert(IRatingController.UnknownRequest.selector);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
    }

    // --- admin ---

    function testFuzz_SetOracleAgent_ReplacesOracle(address next) public {
        vm.assume(next != address(0) && next != oracle && next != owner);
        bytes32 id = _requestBy(alice);

        vm.expectEmit(address(controller));
        emit IRatingController.OracleAgentUpdated(next);
        vm.prank(owner);
        controller.setOracleAgent(next);
        assertEq(controller.oracleAgent(), next);

        vm.prank(oracle);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.fulfilPhase1(id, 42, RKA);

        vm.prank(next);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function test_SetOracleAgent_OldOracleCannotCancel() public {
        bytes32 id = _requestBy(alice);
        vm.prank(owner);
        controller.setOracleAgent(bob);

        vm.prank(oracle);
        vm.expectRevert(IRatingController.NotOracle.selector);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);

        vm.prank(bob);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
    }

    function test_SetOracleAgent_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(IRatingController.ZeroAddress.selector);
        controller.setOracleAgent(address(0));
    }

    function testFuzz_SetOracleAgent_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.setOracleAgent(bob);
    }

    function testFuzz_SetMaxPending_UpdatesCap(uint8 max) public {
        max = uint8(bound(max, 1, type(uint8).max));
        vm.expectEmit(address(controller));
        emit IRatingController.MaxPendingPerRequesterUpdated(max);
        vm.prank(owner);
        controller.setMaxPendingPerRequester(max);
        assertEq(controller.maxPendingPerRequester(), max);
    }

    function test_SetMaxPending_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(IRatingController.InvalidCap.selector);
        controller.setMaxPendingPerRequester(0);
    }

    function testFuzz_SetMaxPending_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.setMaxPendingPerRequester(5);
    }

    function test_SetMaxPending_LoweringOnlyBlocksNewRequests() public {
        bytes32 first = _requestBy(alice);
        _requestBy(alice);
        _requestBy(alice);

        vm.prank(owner);
        controller.setMaxPendingPerRequester(1);
        assertEq(controller.pendingCountOf(alice), 3);

        // Existing requests still settle.
        _fulfil(first);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRatingController.TooManyPending.selector, 2, 1));
        controller.requestPhase1(TARGET);
    }

    // --- owner and oracle stay different addresses (ADR 0030) ---

    function test_Constructor_RevertsWhenOracleIsDeployer() public {
        vm.prank(alice);
        vm.expectRevert(IRatingController.SameOwnerAndOracle.selector);
        new RatingController(alice, 3);
    }

    function test_SetOracleAgent_RevertsOnOwner() public {
        vm.prank(owner);
        vm.expectRevert(IRatingController.SameOwnerAndOracle.selector);
        controller.setOracleAgent(owner);
    }

    function test_TransferOwnership_RevertsOnOracle() public {
        vm.prank(owner);
        vm.expectRevert(IRatingController.SameOwnerAndOracle.selector);
        controller.transferOwnership(oracle);
    }

    function test_AcceptOwnership_RevertsWhenPendingOwnerBecameOracle() public {
        vm.startPrank(owner);
        controller.transferOwnership(bob);
        controller.setOracleAgent(bob);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(IRatingController.SameOwnerAndOracle.selector);
        controller.acceptOwnership();
        assertEq(controller.owner(), owner);
    }

    function test_Ownership_MovesInTwoSteps() public {
        vm.prank(owner);
        controller.transferOwnership(bob);
        assertEq(controller.owner(), owner);
        assertEq(controller.pendingOwner(), bob);

        vm.prank(bob);
        controller.acceptOwnership();
        assertEq(controller.owner(), bob);

        vm.prank(bob);
        controller.setMaxPendingPerRequester(5);
    }

    function testFuzz_RenounceOwnership_RevertsForAnyone(address caller) public {
        vm.prank(caller);
        vm.expectRevert(IRatingController.RenounceOwnershipDisabled.selector);
        controller.renounceOwnership();
    }

    function test_RenounceOwnership_KeepsOwner() public {
        vm.prank(owner);
        vm.expectRevert(IRatingController.RenounceOwnershipDisabled.selector);
        controller.renounceOwnership();
        assertEq(controller.owner(), owner);
    }

    // --- pause ---

    function _pause() internal {
        vm.prank(owner);
        controller.pause();
    }

    function test_Pause_ByOwnerPausesAndEmits() public {
        vm.expectEmit(address(controller));
        emit Pausable.Paused(owner);
        _pause();
        assertTrue(controller.paused());
    }

    function test_Pause_BlocksRequestsAndKeepsNonce() public {
        _requestBy(alice);
        _pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        controller.requestPhase1(TARGET);
        assertEq(controller.nonce(), 1);
    }

    function test_Pause_OracleStillFulfils() public {
        bytes32 id = _requestBy(alice);
        _pause();
        _fulfil(id);
        assertEq(uint8(controller.getRatingRequest(id).status), uint8(IRatingController.Status.Fulfilled));
        assertEq(controller.pendingCount(), 0);
    }

    function test_Pause_OracleStillCancels() public {
        bytes32 id = _requestBy(alice);
        _pause();
        vm.prank(oracle);
        controller.cancelRequest(id, IRatingController.CancelReason.Expired);
        _assertCancelled(id, IRatingController.CancelReason.Expired);
    }

    function test_Unpause_ByOwnerResumesRequests() public {
        _pause();
        vm.expectEmit(address(controller));
        emit Pausable.Unpaused(owner);
        vm.prank(owner);
        controller.unpause();
        assertFalse(controller.paused());
        _requestBy(alice);
        assertEq(controller.pendingCount(), 1);
    }

    function testFuzz_Pause_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.pause();
    }

    function testFuzz_Unpause_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        _pause();
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.unpause();
    }

    function test_Pause_RevertsWhenAlreadyPaused() public {
        _pause();
        vm.prank(owner);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        controller.pause();
    }

    function test_Unpause_RevertsWhenNotPaused() public {
        vm.prank(owner);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        controller.unpause();
    }

    function test_Pause_OwnerAdminStillWorks() public {
        _pause();
        address next = makeAddr("next oracle");
        vm.startPrank(owner);
        controller.setOracleAgent(next);
        controller.setMaxPendingPerRequester(5);
        vm.stopPrank();
        assertEq(controller.oracleAgent(), next);
        assertEq(controller.maxPendingPerRequester(), 5);
    }

    // --- views ---

    function testFuzz_GetRatingRequest_UnknownIsZeroed(bytes32 id) public view {
        IRatingController.RatingRequest memory r = controller.getRatingRequest(id);
        assertEq(r.requester, address(0));
        assertEq(r.requestedAt, 0);
        assertEq(uint8(r.status), uint8(IRatingController.Status.None));
        assertEq(uint8(r.cancelReason), uint8(IRatingController.CancelReason.None));
        assertEq(r.phase1Score, 0);
        assertEq(r.targetUal, "");
        assertEq(r.rKaUal, "");
    }

    function test_PendingRequestIds_ReturnsRange() public {
        bytes32 a = _requestBy(alice);
        bytes32 b = _requestBy(bob);
        bytes32 c = _requestBy(owner);

        assertEq(controller.pendingCount(), 3);
        bytes32[] memory ids = controller.pendingRequestIds(1, 1);
        assertEq(ids.length, 1);
        assertEq(ids[0], b);

        ids = controller.pendingRequestIds(0, 10);
        assertEq(ids.length, 3);
        assertEq(ids[0], a);
        assertEq(ids[2], c);

        ids = controller.pendingRequestIds(2, type(uint256).max);
        assertEq(ids.length, 1);
        assertEq(ids[0], c);
    }

    function testFuzz_PendingRequestIds_OffsetPastEndIsEmpty(uint256 offset, uint256 limit) public {
        _requestBy(alice);
        offset = bound(offset, 1, type(uint256).max);
        assertEq(controller.pendingRequestIds(offset, limit).length, 0);
    }

    function test_RequestIdsOf_ReturnsRangeOldestFirstAndKeepsSettled() public {
        bytes32 a = _requestBy(alice);
        bytes32 b = _requestBy(bob);
        bytes32 c = _requestBy(alice);
        _fulfil(a);
        vm.prank(alice);
        controller.requestPhase1("did:dkg:otp:20430/0xabc/9");

        assertEq(controller.requestCountOf(TARGET), 3);
        bytes32[] memory ids = controller.requestIdsOf(TARGET, 0, 2);
        assertEq(ids.length, 2);
        assertEq(ids[0], a);
        assertEq(ids[1], b);

        ids = controller.requestIdsOf(TARGET, 2, type(uint256).max);
        assertEq(ids.length, 1);
        assertEq(ids[0], c);

        assertEq(controller.requestCountOf("unknown"), 0);
    }

    function testFuzz_RequestIdsOf_OffsetPastEndIsEmpty(uint256 offset, uint256 limit) public {
        _requestBy(alice);
        offset = bound(offset, 1, type(uint256).max);
        assertEq(controller.requestIdsOf(TARGET, offset, limit).length, 0);
    }
}
