// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title RatingController
/// @author verisci
/// @notice Records phase-1 rating requests for target UALs and the oracle's answers.
contract RatingController is Ownable2Step {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @notice Where a request is in its life.
    enum Status {
        None,
        Pending,
        Fulfilled,
        Cancelled
    }

    /// @notice Why a request was cancelled.
    enum CancelReason {
        None,
        MaxAge,
        InvalidTarget,
        Owner
    }

    /// @notice One phase-1 rating request.
    /// @param requester The address that requested the rating.
    /// @param requestedAt The block timestamp of the request.
    /// @param status Where the request is in its life.
    /// @param cancelReason Why it was cancelled, or `None`.
    /// @param phase1Score The phase-1 score, 0 to 100, once fulfilled.
    /// @param targetUal The UAL of the rated Target KA.
    /// @param rKaUal The UAL of the rating's R-KA, once fulfilled.
    struct Request {
        address requester;
        uint64 requestedAt;
        Status status;
        CancelReason cancelReason;
        uint8 phase1Score;
        string targetUal;
        string rKaUal;
    }

    /// @notice Longest target UAL accepted, in bytes.
    uint256 public constant MAX_TARGET_UAL_LENGTH = 256;

    /// @notice Highest phase-1 score.
    uint8 public constant MAX_SCORE = 100;

    /// @notice Per-requester pending cap set at deployment (ADR 0015).
    uint256 public constant DEFAULT_MAX_PENDING_PER_REQUESTER = 3;

    /// @notice Number of requests made so far; hashed into each request id.
    uint256 public nonce;

    /// @notice The only address that can fulfil requests.
    address public oracleAgent;

    /// @notice Maximum number of pending requests per requester.
    uint256 public maxPendingPerRequester;

    /// @notice Number of pending requests per requester.
    mapping(address requester => uint256 count) public pendingCountOf;

    mapping(bytes32 requestId => Request request) private _requests;

    /// @dev Pending request ids, which the reconciler lists to recover stuck requests (ADR 0020).
    EnumerableSet.Bytes32Set private _pending;

    /// @dev Request ids per `keccak256(targetUal)`, oldest first (ADR 0022).
    mapping(bytes32 targetUalHash => bytes32[] requestIds) private _ratingsOf;

    /// @notice Emitted when a phase-1 rating is requested.
    /// @param requestId The new request id.
    /// @param requester The address that requested it.
    /// @param targetUalHash `keccak256` of the target UAL.
    /// @param targetUal The target UAL.
    /// @param requestedAt The block timestamp of the request.
    event Phase1Requested(
        bytes32 indexed requestId,
        address indexed requester,
        bytes32 indexed targetUalHash,
        string targetUal,
        uint64 requestedAt
    );

    /// @notice Emitted when the oracle records a phase-1 score.
    /// @param requestId The fulfilled request id.
    /// @param score The phase-1 score, 0 to 100.
    /// @param rKaUal The UAL of the rating's R-KA.
    event Phase1Fulfilled(bytes32 indexed requestId, uint8 score, string rKaUal);

    /// @notice Emitted when a pending request is cancelled.
    /// @param requestId The cancelled request id.
    /// @param reason Why it was cancelled.
    event RequestCancelled(bytes32 indexed requestId, CancelReason reason);

    /// @notice Emitted when the oracle address changes.
    /// @param oracleAgent The new oracle address.
    event OracleAgentUpdated(address indexed oracleAgent);

    /// @notice Emitted when the per-requester pending cap changes.
    /// @param max The new cap.
    event MaxPendingPerRequesterUpdated(uint256 max);

    /// @notice The target UAL is empty.
    error EmptyTargetUal();

    /// @notice The target UAL is longer than 256 bytes.
    error TargetUalTooLong();

    /// @notice The requester already has `maxPendingPerRequester` pending requests.
    error TooManyPending();

    /// @notice The caller is not the oracle.
    error NotOracle();

    /// @notice The caller is neither the oracle nor the owner.
    error NotOracleOrOwner();

    /// @notice No request has this id.
    error UnknownRequest();

    /// @notice The request is not pending.
    error NotPending();

    /// @notice The score is above 100.
    error InvalidScore();

    /// @notice The R-KA UAL is empty.
    error EmptyRKaUal();

    /// @notice The caller may not cancel with this reason.
    error InvalidCancelReason();

    /// @notice The address is zero.
    error ZeroAddress();

    /// @notice The cap is zero.
    error InvalidCap();

    /// @notice Deploys the controller, owned by the deployer.
    /// @param oracleAgent_ The address allowed to fulfil requests.
    constructor(address oracleAgent_) Ownable(msg.sender) {
        _setOracleAgent(oracleAgent_);
        _setMaxPendingPerRequester(DEFAULT_MAX_PENDING_PER_REQUESTER);
    }

    /// @notice Requests a phase-1 rating of `targetUal`.
    /// @param targetUal The UAL of the Target KA to rate.
    /// @return requestId The new request id.
    function requestPhase1(string calldata targetUal) external returns (bytes32 requestId) {
        uint256 length = bytes(targetUal).length;
        if (length == 0) revert EmptyTargetUal();
        if (length > MAX_TARGET_UAL_LENGTH) revert TargetUalTooLong();
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
        _pending.add(requestId);
        _ratingsOf[targetUalHash].push(requestId);

        emit Phase1Requested(requestId, msg.sender, targetUalHash, targetUal, requestedAt);
    }

    /// @notice Records the phase-1 score and R-KA of a pending request.
    /// @param requestId The request to fulfil.
    /// @param score The phase-1 score, 0 to 100.
    /// @param rKaUal The UAL of the rating's R-KA.
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

    /// @notice Cancels a pending request.
    /// @param requestId The request to cancel.
    /// @param reason Why it is cancelled.
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

    /// @notice Sets the oracle address.
    /// @param oracleAgent_ The new oracle address.
    function setOracleAgent(address oracleAgent_) external onlyOwner {
        _setOracleAgent(oracleAgent_);
    }

    /// @notice Sets the per-requester pending cap.
    /// @param max The new cap.
    function setMaxPendingPerRequester(uint256 max) external onlyOwner {
        _setMaxPendingPerRequester(max);
    }

    /// @notice Returns a request.
    /// @param requestId The request id.
    /// @return request The request.
    function getRequest(bytes32 requestId) external view returns (Request memory request) {
        return _requests[requestId];
    }

    /// @notice Returns the number of pending requests.
    /// @return count The number of pending requests.
    function pendingCount() external view returns (uint256 count) {
        return _pending.length();
    }

    /// @notice Returns a page of pending request ids.
    /// @dev Removing an id moves the last one into its slot, so the order changes as requests settle.
    /// @param offset The index of the first id.
    /// @param limit The maximum number of ids.
    /// @return ids The page of ids.
    function pendingRequestIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        (uint256 start, uint256 end) = _pageBounds(_pending.length(), offset, limit);
        return _pending.values(start, end);
    }

    /// @notice Returns the number of requests made for a target.
    /// @param targetUal The target UAL.
    /// @return count The number of requests.
    function ratingsCountOf(string calldata targetUal) external view returns (uint256 count) {
        return _ratingsOf[keccak256(bytes(targetUal))].length;
    }

    /// @notice Returns a page of a target's request ids.
    /// @param targetUal The target UAL.
    /// @param offset The index of the first id.
    /// @param limit The maximum number of ids.
    /// @return ids The page of ids.
    function ratingsOf(string calldata targetUal, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids)
    {
        bytes32[] storage all = _ratingsOf[keccak256(bytes(targetUal))];
        (uint256 start, uint256 end) = _pageBounds(all.length, offset, limit);
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

    function _setMaxPendingPerRequester(uint256 max) private {
        if (max == 0) revert InvalidCap();
        maxPendingPerRequester = max;
        emit MaxPendingPerRequesterUpdated(max);
    }

    function _pendingRequest(bytes32 requestId) private view returns (Request storage request) {
        request = _requests[requestId];
        if (request.status == Status.None) revert UnknownRequest();
        if (request.status != Status.Pending) revert NotPending();
    }

    /// @dev Takes a request out of the pending set and frees one slot of its requester's cap.
    function _settle(bytes32 requestId, address requester) private {
        _pending.remove(requestId);
        --pendingCountOf[requester];
    }

    /// @dev Clamps `[offset, offset + limit)` to `[0, length)` without overflowing.
    function _pageBounds(uint256 length, uint256 offset, uint256 limit)
        private
        pure
        returns (uint256 start, uint256 end)
    {
        if (offset >= length) return (length, length);
        uint256 remaining = length - offset;
        return (offset, offset + (limit < remaining ? limit : remaining));
    }
}
