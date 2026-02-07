// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.27;

contract ElectionCommission {

    struct Candidate {
        uint256 candidateID;
        string name;
        string party;
        uint256 voteCount;
        bool isCandidate;
    }

    struct Party {
        uint256 partyId;
        string name;
        string leader;
        string description;
        string logo;
        bool exists;
    }

    // pollingBoothId => candidateId => Candidate
    mapping(string => mapping(uint256 => Candidate)) public candidates;

    mapping(string => uint256[]) public candidateIdsByBooth;
    mapping(string => uint256) public candidateCountByBooth;

    mapping(uint256 => Party) public parties;
    uint256 public partyCount;

    address public electionCommission;
    bool public votingStarted;
    bool public votingEnded;

    constructor() {
        electionCommission = msg.sender;
    }

    modifier onlyElectionCommission() {
        require(msg.sender == electionCommission, "Only EC allowed");
        _;
    }

    // =========================
    // PARTY FUNCTIONS
    // =========================
    function addParty(
        string calldata _name,
        string calldata _leader,
        string calldata _description,
        string calldata _logo
    ) external onlyElectionCommission {

        require(bytes(_name).length > 0, "Party name required");

        partyCount++;

        parties[partyCount] = Party(
            partyCount,
            _name,
            _leader,
            _description,
            _logo,
            true
        );
    }
    // =========================
// Remove a party
// =========================
function removeParty(uint256 _partyId) external onlyElectionCommission {
    require(_partyId > 0 && _partyId <= partyCount, "Invalid party ID");
    require(parties[_partyId].exists, "Party does not exist");

    parties[_partyId].exists = false; // mark as removed
}

    function getAllParties()
    external
    view
    returns (
        uint256[] memory,
        string[] memory,
        string[] memory,
        string[] memory,
        string[] memory
    )
{
    uint256 activeCount = 0;
    for (uint256 i = 1; i <= partyCount; i++) {
        if (parties[i].exists) activeCount++;
    }

    uint256[] memory ids = new uint256[](activeCount);
    string[] memory names = new string[](activeCount);
    string[] memory leaders = new string[](activeCount);
    string[] memory descs = new string[](activeCount);
    string[] memory logos = new string[](activeCount);

    uint256 index = 0;
    for (uint256 i = 1; i <= partyCount; i++) {
        if (!parties[i].exists) continue;

        Party memory p = parties[i];
        ids[index] = p.partyId;
        names[index] = p.name;
        leaders[index] = p.leader;
        descs[index] = p.description;
        logos[index] = p.logo;
        index++;
    }

    return (ids, names, leaders, descs, logos);
}


    // =========================
    // CANDIDATES
    // =========================
    function addCandidate(
        string calldata pollingBoothId,
        uint256 _candidateID,
        string calldata _name,
        string calldata _party
    ) external onlyElectionCommission {

        require(_candidateID != 0, "Invalid ID");
        require(!candidates[pollingBoothId][_candidateID].isCandidate, "Candidate exists");

        candidates[pollingBoothId][_candidateID] = Candidate(
            _candidateID,
            _name,
            _party,
            0,
            true
        );

        candidateIdsByBooth[pollingBoothId].push(_candidateID);
        candidateCountByBooth[pollingBoothId]++;
    }

    function getCandidatesByBooth(
        string calldata pollingBoothId
    )
        external
        view
        returns (
            uint256[] memory,
            string[] memory,
            string[] memory,
            uint256[] memory
        )
    {
        uint256 count = candidateIdsByBooth[pollingBoothId].length;

        uint256[] memory ids = new uint256[](count);
        string[] memory names = new string[](count);
        string[] memory partiesList = new string[](count);
        uint256[] memory votes = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 id = candidateIdsByBooth[pollingBoothId][i];
            Candidate memory c = candidates[pollingBoothId][id];

            ids[i] = c.candidateID;
            names[i] = c.name;
            partiesList[i] = c.party;
            votes[i] = c.voteCount;
        }

        return (ids, names, partiesList, votes);
    }

    function isCandidateValid(
        string calldata pollingBoothId,
        uint256 candidateId
    ) external view returns (bool) {
        return candidates[pollingBoothId][candidateId].isCandidate;
    }

    function start_voting() external onlyElectionCommission {
        votingStarted = true;
        votingEnded = false;
    }

    function end_voting() external onlyElectionCommission {
        votingStarted = false;
        votingEnded = true;
    }
}