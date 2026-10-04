// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IRatingController
/// @author verisci
/// @notice Public API of the rating controller: phase-1 rating requests for target UALs and
///         the oracle's answers. Types, events and errors live here; the contract holds logic.
interface IRatingController {
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
        InvalidTarget
    }

    /// @notice A rating request: who asked, for which target, and where it stands; the phase-1
    ///         score and R-KA once fulfilled. It becomes a rating when fulfilled (ADR 0013).
    /// @param requester The address that requested the rating.
    /// @param requestedAt The block timestamp of the request.
    /// @param status Where the request is in its life.
    /// @param cancelReason Why it was cancelled, or `None`.
    /// @param phase1Score The phase-1 score, 0 to 100, once fulfilled.
    /// @param targetUal The UAL of the rated Target KA.
    /// @param rKaUal The UAL of the rating's R-KA, once fulfilled.
    struct RatingRequest {
        address requester;
        uint64 requestedAt;
        Status status;
        CancelReason cancelReason;
        uint8 phase1Score;
        string targetUal;
        string rKaUal;
    }

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
    event MaxPendingPerRequesterUpdated(uint8 max);

    /// @notice The target UAL is empty.
    error EmptyTargetUal();

    /// @notice The requester already has `maxPendingPerRequester` pending requests.
    error TooManyPending();

    /// @notice The caller is not the oracle.
    error NotOracle();

    /// @notice No request has this id.
    error UnknownRequest();

    /// @notice The request is not pending.
    error NotPending();

    /// @notice The score is above 100.
    error InvalidScore();

    /// @notice The R-KA UAL is empty.
    error EmptyRKaUal();

    /// @notice The cancel reason is `None`.
    error InvalidCancelReason();

    /// @notice The address is zero.
    error ZeroAddress();

    /// @notice The cap is zero.
    error InvalidCap();

    /// @notice Requests a phase-1 rating of `targetUal`.
    /// @param targetUal The UAL of the Target KA to rate.
    /// @return requestId The new request id.
    function requestPhase1(string calldata targetUal) external returns (bytes32 requestId);

    /// @notice Records the phase-1 score and R-KA of a pending request. Oracle only.
    /// @param requestId The request to fulfil.
    /// @param score The phase-1 score, 0 to 100.
    /// @param rKaUal The UAL of the rating's R-KA.
    function fulfilPhase1(bytes32 requestId, uint8 score, string calldata rKaUal) external;

    /// @notice Cancels a pending request, with the reason it stopped (ADR 0024). Oracle only.
    /// @param requestId The request to cancel.
    /// @param reason Why it is cancelled.
    function cancelRequest(bytes32 requestId, CancelReason reason) external;

    /// @notice Sets the oracle address. Owner only.
    /// @param oracleAgent The new oracle address.
    function setOracleAgent(address oracleAgent) external;

    /// @notice Sets the per-requester pending cap. Owner only.
    /// @param max The new cap.
    function setMaxPendingPerRequester(uint8 max) external;

    /// @notice Highest phase-1 score.
    /// @return max The highest score, 100.
    function MAX_SCORE() external view returns (uint8 max);

    /// @notice Number of requests made so far; hashed into each request id.
    /// @return count The number of requests made.
    function nonce() external view returns (uint256 count);

    /// @notice The only address that can fulfil requests.
    /// @return oracle The oracle address.
    function oracleAgent() external view returns (address oracle);

    /// @notice Maximum number of pending requests per requester.
    /// @return max The cap.
    function maxPendingPerRequester() external view returns (uint8 max);

    /// @notice Number of pending requests of `requester`.
    /// @param requester The requester.
    /// @return count Their pending requests.
    function pendingCountOf(address requester) external view returns (uint256 count);

    /// @notice Returns a rating request; an unknown id returns a zeroed record with status `None`.
    /// @param requestId The request id.
    /// @return request The rating request.
    function getRatingRequest(bytes32 requestId) external view returns (RatingRequest memory request);

    /// @notice Returns the number of pending requests.
    /// @return count The number of pending requests.
    function pendingCount() external view returns (uint256 count);

    /// @notice Returns up to `limit` pending request ids, starting at index `offset`.
    /// @dev Removing an id moves the last one into its slot, so the order changes as requests settle.
    /// @param offset The index of the first id.
    /// @param limit The maximum number of ids.
    /// @return ids The pending request ids in that range.
    function pendingRequestIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids);

    /// @notice Returns the number of requests made for a target.
    /// @param targetUal The target UAL.
    /// @return count The number of requests.
    function requestCountOf(string calldata targetUal) external view returns (uint256 count);

    /// @notice Returns up to `limit` of a target's request ids, oldest first, starting at index
    ///         `offset`.
    /// @param targetUal The target UAL.
    /// @param offset The index of the first id.
    /// @param limit The maximum number of ids.
    /// @return ids The target's request ids in that range.
    function requestIdsOf(string calldata targetUal, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids);
}
