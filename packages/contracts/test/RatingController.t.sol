// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";
import {RatingController} from "../src/RatingController.sol";

/// @title RatingControllerTest
/// @notice Unit and fuzz tests for RatingController.
contract RatingControllerTest is Test {
    RatingController internal controller;

    address internal owner = makeAddr("owner");
    address internal oracle = makeAddr("oracle");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    string internal constant TARGET = "did:dkg:otp:20430/0xabc/1";
    string internal constant RKA = "did:dkg:otp:20430/0xabc/2";

    function setUp() public {
        vm.prank(owner);
        controller = new RatingController(oracle);
    }

    // --- helpers ---

    function _expectedId(uint256 chainId, address at, uint256 nonce, address requester, string memory targetUal)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(chainId, at, nonce, requester, keccak256(bytes(targetUal))));
    }

    function _request(address requester) internal returns (bytes32) {
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
        emit RatingController.OracleAgentUpdated(oracle);
        vm.expectEmit();
        emit RatingController.MaxPendingPerRequesterUpdated(3);
        new RatingController(oracle);
    }

    function test_Constructor_RevertsOnZeroOracle() public {
        vm.expectRevert(RatingController.ZeroAddress.selector);
        new RatingController(address(0));
    }

    // --- requestPhase1 ---

    function test_Request_StoresPendingRequest() public {
        vm.warp(1_700_000_000);
        bytes32 id = _request(alice);

        RatingController.Request memory r = controller.getRequest(id);
        assertEq(r.requester, alice);
        assertEq(r.requestedAt, 1_700_000_000);
        assertEq(uint8(r.status), uint8(RatingController.Status.Pending));
        assertEq(uint8(r.cancelReason), uint8(RatingController.CancelReason.None));
        assertEq(r.phase1Score, 0);
        assertEq(r.targetUal, TARGET);
        assertEq(r.rKaUal, "");

        assertEq(controller.nonce(), 1);
        assertEq(controller.pendingCountOf(alice), 1);
        assertEq(controller.pendingCount(), 1);
        assertEq(controller.pendingRequestIds(0, 10)[0], id);
        assertEq(controller.ratingsCountOf(TARGET), 1);
        assertEq(controller.ratingsOf(TARGET, 0, 10)[0], id);
    }

    function test_Request_EmitsPhase1Requested() public {
        vm.warp(1_700_000_000);
        bytes32 expected = _expectedId(block.chainid, address(controller), 0, alice, TARGET);
        vm.expectEmit(address(controller));
        emit RatingController.Phase1Requested(expected, alice, keccak256(bytes(TARGET)), TARGET, 1_700_000_000);
        _request(alice);
    }

    function test_Request_SameRequesterAndTargetGetDistinctIds() public {
        bytes32 first = _request(alice);
        bytes32 second = _request(alice);
        assertNotEq(first, second);
        assertEq(controller.ratingsCountOf(TARGET), 2);
    }

    function testFuzz_Request_IdMatchesScheme(address requester, string calldata targetUal, uint64 chainId) public {
        vm.assume(bytes(targetUal).length > 0 && bytes(targetUal).length <= 256);
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
        bytes32 idA = _request(alice);
        vm.revertToState(snapshot);
        vm.chainId(chainB);
        bytes32 idB = _request(alice);
        assertNotEq(idA, idB);
    }

    function testFuzz_Request_IdsDifferAcrossDeployments(address atA, address atB) public {
        vm.assume(atA != atB);
        assumeNotPrecompile(atA);
        assumeNotPrecompile(atB);
        assumeNotForgeAddress(atA);
        assumeNotForgeAddress(atB);
        vm.assume(atA.code.length == 0 && atB.code.length == 0);

        deployCodeTo("RatingController.sol:RatingController", abi.encode(oracle), atA);
        deployCodeTo("RatingController.sol:RatingController", abi.encode(oracle), atB);

        vm.prank(alice);
        bytes32 idA = RatingController(atA).requestPhase1(TARGET);
        vm.prank(alice);
        bytes32 idB = RatingController(atB).requestPhase1(TARGET);
        assertNotEq(idA, idB);
    }

    function test_Request_RevertsOnEmptyTarget() public {
        vm.expectRevert(RatingController.EmptyTargetUal.selector);
        controller.requestPhase1("");
    }

    function test_Request_AcceptsTargetOf256Bytes() public {
        controller.requestPhase1(_ualOfLength(256));
        assertEq(controller.pendingCount(), 1);
    }

    function testFuzz_Request_RevertsOnTargetOver256Bytes(uint256 length) public {
        length = bound(length, 257, 2048);
        string memory ual = _ualOfLength(length);
        vm.expectRevert(RatingController.TargetUalTooLong.selector);
        controller.requestPhase1(ual);
    }

    function test_Request_RevertsPastCapUntilOneSettles() public {
        bytes32 first = _request(alice);
        _request(alice);
        _request(alice);

        vm.prank(alice);
        vm.expectRevert(RatingController.TooManyPending.selector);
        controller.requestPhase1(TARGET);

        // Each requester has their own cap.
        _request(bob);

        _fulfil(first);
        _request(alice);
        assertEq(controller.pendingCountOf(alice), 3);
    }

    // --- fulfilPhase1 ---

    function testFuzz_Fulfil_RecordsScoreAndRKa(uint8 score) public {
        score = uint8(bound(score, 0, 100));
        bytes32 id = _request(alice);

        vm.expectEmit(address(controller));
        emit RatingController.Phase1Fulfilled(id, score, RKA);
        vm.prank(oracle);
        controller.fulfilPhase1(id, score, RKA);

        RatingController.Request memory r = controller.getRequest(id);
        assertEq(uint8(r.status), uint8(RatingController.Status.Fulfilled));
        assertEq(r.phase1Score, score);
        assertEq(r.rKaUal, RKA);
        assertEq(controller.pendingCount(), 0);
        assertEq(controller.pendingCountOf(alice), 0);
    }

    function testFuzz_Fulfil_RevertsWhenNotOracle(address caller) public {
        vm.assume(caller != oracle);
        bytes32 id = _request(alice);
        vm.prank(caller);
        vm.expectRevert(RatingController.NotOracle.selector);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function testFuzz_Fulfil_RevertsOnUnknownRequest(bytes32 id) public {
        vm.prank(oracle);
        vm.expectRevert(RatingController.UnknownRequest.selector);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function test_Fulfil_RevertsWhenNotPending() public {
        bytes32 id = _request(alice);
        _fulfil(id);
        vm.prank(oracle);
        vm.expectRevert(RatingController.NotPending.selector);
        controller.fulfilPhase1(id, 7, "other");
    }

    function testFuzz_Fulfil_RevertsOnScoreAbove100(uint8 score) public {
        score = uint8(bound(score, 101, 255));
        bytes32 id = _request(alice);
        vm.prank(oracle);
        vm.expectRevert(RatingController.InvalidScore.selector);
        controller.fulfilPhase1(id, score, RKA);
    }

    function test_Fulfil_RevertsOnEmptyRKa() public {
        bytes32 id = _request(alice);
        vm.prank(oracle);
        vm.expectRevert(RatingController.EmptyRKaUal.selector);
        controller.fulfilPhase1(id, 42, "");
    }

    // --- cancelRequest ---

    function _assertCancelled(bytes32 id, RatingController.CancelReason reason) internal view {
        RatingController.Request memory r = controller.getRequest(id);
        assertEq(uint8(r.status), uint8(RatingController.Status.Cancelled));
        assertEq(uint8(r.cancelReason), uint8(reason));
        assertEq(controller.pendingCount(), 0);
        assertEq(controller.pendingCountOf(alice), 0);
    }

    function test_Cancel_ByOracleWithMaxAge() public {
        bytes32 id = _request(alice);
        vm.expectEmit(address(controller));
        emit RatingController.RequestCancelled(id, RatingController.CancelReason.MaxAge);
        vm.prank(oracle);
        controller.cancelRequest(id, RatingController.CancelReason.MaxAge);
        _assertCancelled(id, RatingController.CancelReason.MaxAge);
    }

    function test_Cancel_ByOracleWithInvalidTarget() public {
        bytes32 id = _request(alice);
        vm.prank(oracle);
        controller.cancelRequest(id, RatingController.CancelReason.InvalidTarget);
        _assertCancelled(id, RatingController.CancelReason.InvalidTarget);
    }

    function test_Cancel_ByOwnerWithOwner() public {
        bytes32 id = _request(alice);
        vm.expectEmit(address(controller));
        emit RatingController.RequestCancelled(id, RatingController.CancelReason.Owner);
        vm.prank(owner);
        controller.cancelRequest(id, RatingController.CancelReason.Owner);
        _assertCancelled(id, RatingController.CancelReason.Owner);
    }

    function testFuzz_Cancel_RevertsForAnyoneElse(address caller, uint8 rawReason) public {
        vm.assume(caller != oracle && caller != owner);
        RatingController.CancelReason reason = RatingController.CancelReason(bound(rawReason, 0, 3));
        bytes32 id = _request(alice);
        vm.prank(caller);
        vm.expectRevert(RatingController.NotOracleOrOwner.selector);
        controller.cancelRequest(id, reason);
    }

    function test_Cancel_RequesterCannotCancel() public {
        bytes32 id = _request(alice);
        vm.prank(alice);
        vm.expectRevert(RatingController.NotOracleOrOwner.selector);
        controller.cancelRequest(id, RatingController.CancelReason.Owner);
    }

    function test_Cancel_RevertsWhenOracleUsesOwnerOrNone() public {
        bytes32 id = _request(alice);
        vm.startPrank(oracle);
        vm.expectRevert(RatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, RatingController.CancelReason.Owner);
        vm.expectRevert(RatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, RatingController.CancelReason.None);
        vm.stopPrank();
    }

    function test_Cancel_RevertsWhenOwnerUsesAnotherReason() public {
        bytes32 id = _request(alice);
        vm.startPrank(owner);
        vm.expectRevert(RatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, RatingController.CancelReason.MaxAge);
        vm.expectRevert(RatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, RatingController.CancelReason.InvalidTarget);
        vm.expectRevert(RatingController.InvalidCancelReason.selector);
        controller.cancelRequest(id, RatingController.CancelReason.None);
        vm.stopPrank();
    }

    function test_Cancel_RevertsWhenNotPending() public {
        bytes32 id = _request(alice);
        _fulfil(id);
        vm.prank(owner);
        vm.expectRevert(RatingController.NotPending.selector);
        controller.cancelRequest(id, RatingController.CancelReason.Owner);
    }

    function testFuzz_Cancel_RevertsOnUnknownRequest(bytes32 id) public {
        vm.prank(owner);
        vm.expectRevert(RatingController.UnknownRequest.selector);
        controller.cancelRequest(id, RatingController.CancelReason.Owner);
    }

    // --- admin ---

    function testFuzz_SetOracleAgent_ReplacesOracle(address next) public {
        vm.assume(next != address(0) && next != oracle);
        bytes32 id = _request(alice);

        vm.expectEmit(address(controller));
        emit RatingController.OracleAgentUpdated(next);
        vm.prank(owner);
        controller.setOracleAgent(next);
        assertEq(controller.oracleAgent(), next);

        vm.prank(oracle);
        vm.expectRevert(RatingController.NotOracle.selector);
        controller.fulfilPhase1(id, 42, RKA);

        vm.prank(next);
        controller.fulfilPhase1(id, 42, RKA);
    }

    function test_SetOracleAgent_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(RatingController.ZeroAddress.selector);
        controller.setOracleAgent(address(0));
    }

    function testFuzz_SetOracleAgent_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.setOracleAgent(bob);
    }

    function testFuzz_SetMaxPending_UpdatesCap(uint256 max) public {
        max = bound(max, 1, type(uint256).max);
        vm.expectEmit(address(controller));
        emit RatingController.MaxPendingPerRequesterUpdated(max);
        vm.prank(owner);
        controller.setMaxPendingPerRequester(max);
        assertEq(controller.maxPendingPerRequester(), max);
    }

    function test_SetMaxPending_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(RatingController.InvalidCap.selector);
        controller.setMaxPendingPerRequester(0);
    }

    function testFuzz_SetMaxPending_RevertsWhenNotOwner(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        controller.setMaxPendingPerRequester(5);
    }

    function test_SetMaxPending_LoweringOnlyBlocksNewRequests() public {
        bytes32 first = _request(alice);
        _request(alice);
        _request(alice);

        vm.prank(owner);
        controller.setMaxPendingPerRequester(1);
        assertEq(controller.pendingCountOf(alice), 3);

        // Existing requests still settle.
        _fulfil(first);

        vm.prank(alice);
        vm.expectRevert(RatingController.TooManyPending.selector);
        controller.requestPhase1(TARGET);
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

    // --- views ---

    function testFuzz_GetRequest_UnknownIsZeroed(bytes32 id) public view {
        RatingController.Request memory r = controller.getRequest(id);
        assertEq(r.requester, address(0));
        assertEq(r.requestedAt, 0);
        assertEq(uint8(r.status), uint8(RatingController.Status.None));
        assertEq(uint8(r.cancelReason), uint8(RatingController.CancelReason.None));
        assertEq(r.phase1Score, 0);
        assertEq(r.targetUal, "");
        assertEq(r.rKaUal, "");
    }

    function test_PendingRequestIds_Pages() public {
        bytes32 a = _request(alice);
        bytes32 b = _request(bob);
        bytes32 c = _request(owner);

        assertEq(controller.pendingCount(), 3);
        bytes32[] memory page = controller.pendingRequestIds(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], b);

        page = controller.pendingRequestIds(0, 10);
        assertEq(page.length, 3);
        assertEq(page[0], a);
        assertEq(page[2], c);

        page = controller.pendingRequestIds(2, type(uint256).max);
        assertEq(page.length, 1);
        assertEq(page[0], c);
    }

    function testFuzz_PendingRequestIds_OffsetPastEndIsEmpty(uint256 offset, uint256 limit) public {
        _request(alice);
        offset = bound(offset, 1, type(uint256).max);
        assertEq(controller.pendingRequestIds(offset, limit).length, 0);
    }

    function test_RatingsOf_PagesOldestFirstAndKeepsSettled() public {
        bytes32 a = _request(alice);
        bytes32 b = _request(bob);
        bytes32 c = _request(alice);
        _fulfil(a);
        vm.prank(alice);
        controller.requestPhase1("did:dkg:otp:20430/0xabc/9");

        assertEq(controller.ratingsCountOf(TARGET), 3);
        bytes32[] memory page = controller.ratingsOf(TARGET, 0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], a);
        assertEq(page[1], b);

        page = controller.ratingsOf(TARGET, 2, type(uint256).max);
        assertEq(page.length, 1);
        assertEq(page[0], c);

        assertEq(controller.ratingsCountOf("unknown"), 0);
    }

    function testFuzz_RatingsOf_OffsetPastEndIsEmpty(uint256 offset, uint256 limit) public {
        _request(alice);
        offset = bound(offset, 1, type(uint256).max);
        assertEq(controller.ratingsOf(TARGET, offset, limit).length, 0);
    }
}
