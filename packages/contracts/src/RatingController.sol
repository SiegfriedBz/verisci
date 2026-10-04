// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IRatingController} from "./interfaces/IRatingController.sol";

/// @title RatingController
/// @author verisci
/// @notice Records phase-1 rating requests for target UALs and the oracle's answers.
contract RatingController is IRatingController, Ownable2Step {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @inheritdoc IRatingController
    uint8 public constant MAX_SCORE = 100;

    /// @inheritdoc IRatingController
    uint256 public nonce;

    /// @inheritdoc IRatingController
    address public oracleAgent;

    /// @inheritdoc IRatingController
    uint8 public maxPendingPerRequester;

    /// @inheritdoc IRatingController
    mapping(address requester => uint256 count) public pendingCountOf;

    mapping(bytes32 requestId => Request request) private _requests;

    /// @dev Pending request ids, which the reconciler lists to recover stuck requests (ADR 0020).
    EnumerableSet.Bytes32Set private _pendingRequestIds;

    /// @dev Request ids per `keccak256(targetUal)`, oldest first (ADR 0022).
    mapping(bytes32 targetUalHash => bytes32[] requestIds) private _ratingsOf;

    /// @notice Deploys the controller, owned by the deployer.
    /// @param oracleAgent_ The address allowed to fulfil requests.
    /// @param maxPendingPerRequester_ The initial per-requester pending cap (ADR 0015).
    constructor(address oracleAgent_, uint8 maxPendingPerRequester_) Ownable(msg.sender) {
        _setOracleAgent(oracleAgent_);
        _setMaxPendingPerRequester(maxPendingPerRequester_);
    }

    /// @inheritdoc IRatingController
    function requestPhase1(string calldata targetUal) external returns (bytes32 requestId) {
        if (bytes(targetUal).length == 0) revert EmptyTargetUal();
        if (pendingCountOf[msg.sender] >= maxPendingPerRequester) revert TooManyPending();

        bytes32 targetUalHash = keccak256(bytes(targetUal));
        requestId = keccak256(abi.encode(block.chainid, address(this), nonce++, msg.sender, targetUalHash));
        // casting to 'uint64' is safe because timestamps stay below 2^64 for billions of years
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 requestedAt = uint64(block.timestamp);

        _requests[requestId] = Request({
            requester: msg.sender,
            requestedAt: requestedAt,
            status: Status.Pending,
            cancelReason: CancelReason.None,
            phase1Score: 0,
            targetUal: targetUal,
            rKaUal: ""
        });
        ++pendingCountOf[msg.sender];
        _pendingRequestIds.add(requestId);
        _ratingsOf[targetUalHash].push(requestId);

        emit Phase1Requested(requestId, msg.sender, targetUalHash, targetUal, requestedAt);
    }

    /// @inheritdoc IRatingController
    function fulfilPhase1(bytes32 requestId, uint8 score, string calldata rKaUal) external {
        if (msg.sender != oracleAgent) revert NotOracle();
        Request storage request = _pendingRequest(requestId);
        if (score > MAX_SCORE) revert InvalidScore();
        if (bytes(rKaUal).length == 0) revert EmptyRKaUal();

        request.status = Status.Fulfilled;
        request.phase1Score = score;
        request.rKaUal = rKaUal;
        _settle(requestId, request.requester);

        emit Phase1Fulfilled(requestId, score, rKaUal);
    }

    /// @inheritdoc IRatingController
    function cancelRequest(bytes32 requestId, CancelReason reason) external {
        bool byOracle = msg.sender == oracleAgent;
        bool byOwner = msg.sender == owner();
        if (!byOracle && !byOwner) revert NotOracleOrOwner();
        // The oracle cancels for operational reasons, the owner only as `Owner`.
        bool allowed = reason == CancelReason.Owner ? byOwner : (reason != CancelReason.None && byOracle);
        if (!allowed) revert InvalidCancelReason();
        Request storage request = _pendingRequest(requestId);

        request.status = Status.Cancelled;
        request.cancelReason = reason;
        _settle(requestId, request.requester);

        emit RequestCancelled(requestId, reason);
    }

    /// @inheritdoc IRatingController
    function setOracleAgent(address oracleAgent_) external onlyOwner {
        _setOracleAgent(oracleAgent_);
    }

    /// @inheritdoc IRatingController
    function setMaxPendingPerRequester(uint8 max) external onlyOwner {
        _setMaxPendingPerRequester(max);
    }

    /// @inheritdoc IRatingController
    function getRequest(bytes32 requestId) external view returns (Request memory request) {
        return _requests[requestId];
    }

    /// @inheritdoc IRatingController
    function pendingCount() external view returns (uint256 count) {
        return _pendingRequestIds.length();
    }

    /// @inheritdoc IRatingController
    function pendingRequestIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        (uint256 start, uint256 end) = _rangeBounds(_pendingRequestIds.length(), offset, limit);
        return _pendingRequestIds.values(start, end);
    }

    /// @inheritdoc IRatingController
    function ratingsCountOf(string calldata targetUal) external view returns (uint256 count) {
        return _ratingsOf[keccak256(bytes(targetUal))].length;
    }

    /// @inheritdoc IRatingController
    function ratingsOf(string calldata targetUal, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids)
    {
        bytes32[] storage all = _ratingsOf[keccak256(bytes(targetUal))];
        (uint256 start, uint256 end) = _rangeBounds(all.length, offset, limit);
        ids = new bytes32[](end - start);
        for (uint256 i; i < ids.length; ++i) {
            ids[i] = all[start + i];
        }
    }

    function _setOracleAgent(address oracleAgent_) private {
        if (oracleAgent_ == address(0)) revert ZeroAddress();
        oracleAgent = oracleAgent_;
        emit OracleAgentUpdated(oracleAgent_);
    }

    /// @dev Shared by the constructor and the owner's setter, so a zero cap is rejected in both.
    function _setMaxPendingPerRequester(uint8 max) private {
        if (max == 0) revert InvalidCap();
        maxPendingPerRequester = max;
        emit MaxPendingPerRequesterUpdated(max);
    }

    /// @dev Takes a request out of the pending set and frees one slot of its requester's cap.
    function _settle(bytes32 requestId, address requester) private {
        _pendingRequestIds.remove(requestId);
        --pendingCountOf[requester];
    }

    function _pendingRequest(bytes32 requestId) private view returns (Request storage request) {
        request = _requests[requestId];
        if (request.status == Status.None) revert UnknownRequest();
        if (request.status != Status.Pending) revert NotPending();
    }

    /// @dev Clamps `[offset, offset + limit)` to `[0, length)` without overflowing.
    function _rangeBounds(uint256 length, uint256 offset, uint256 limit)
        private
        pure
        returns (uint256 start, uint256 end)
    {
        if (offset >= length) return (length, length);
        uint256 remaining = length - offset;
        return (offset, offset + (limit < remaining ? limit : remaining));
    }
}
