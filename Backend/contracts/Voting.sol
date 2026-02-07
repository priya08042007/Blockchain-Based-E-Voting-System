// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/*
   We extend the IEC interface so we can READ candidate info
   directly from ElectionCommission contract.
*/
interface IEC {
    function votingStarted() external view returns (bool);
    function votingEnded() external view returns (bool);

    function isCandidateValid(
        string calldata pollingBoothId,
        uint candidateId
    ) external view returns (bool);

    // Auto-generated getter for public mapping in EC.sol:
    // candidates(string => id => Candidate)
    function candidates(
        string calldata,
        uint256
    )
        external
        view
        returns (
            uint256 candidateID,
            string memory name,
            string memory party,
            uint256 voteCount,
            bool isCandidate
        );
}

contract Voting {

    IEC public ec;

    // booth => candidate => total votes
    mapping(string => mapping(uint => uint)) private voteCount;

    // prevent double-voting
    mapping(bytes32 => bool) public hasVoted;

    // Store each voter vote info
    struct VoteRecord {
        string booth;
        uint candidateId;
        bool exists;
    }

    // epicHash => vote record
    mapping(bytes32 => VoteRecord) private votes;

    event VoteCast(
        string pollingBoothId,
        uint candidateId,
        bytes32 receiptHash
    );

    constructor(address _ecAddress) {
        ec = IEC(_ecAddress);
    }

    modifier votingIsActive() {
        require(ec.votingStarted(), "Voting not started");
        require(!ec.votingEnded(), "Voting ended");
        _;
    }

    function castVote(
        string calldata pollingBoothId,
        uint candidateId,
        bytes32 epicHash
    ) external votingIsActive {

        require(!hasVoted[epicHash], "Already voted");

        require(
            ec.isCandidateValid(pollingBoothId, candidateId),
            "Invalid candidate"
        );

        // increase vote count
        voteCount[pollingBoothId][candidateId]++;

        // mark voter
        hasVoted[epicHash] = true;

        // store verification info
        votes[epicHash] = VoteRecord({
            booth: pollingBoothId,
            candidateId: candidateId,
            exists: true
        });

        emit VoteCast(pollingBoothId, candidateId, epicHash);
    }

    // =========================
    // VERIFY VOTE (main feature)
    // =========================
    function verifyMyVote(bytes32 epicHash)
        external
        view
        returns (
            string memory pollingBoothId,
            uint candidateId,
            string memory candidateName,
            string memory party
        )
    {
        require(votes[epicHash].exists, "No vote found");

        VoteRecord memory record = votes[epicHash];

        (
            ,
            string memory name,
            string memory partyName,
            ,
            /* bool isCandidate */
        ) = ec.candidates(record.booth, record.candidateId);

        return (
            record.booth,
            record.candidateId,
            name,
            partyName
        );
    }

    function getVoteCount(
        string calldata pollingBoothId,
        uint candidateId
    ) external view returns (uint) {
        return voteCount[pollingBoothId][candidateId];
    }
}