/**
 * CONNECTS UI TO BLOCKCHAIN LOGIC
 */

// State variables
let votingSystem = new Blockchain();
let isElectionActive = false;
let candidates = {}; // Name -> Count

// UI Elements
const terminal = document.getElementById('terminal');
const statusDiv = document.getElementById('status-bar');
const candidatesList = document.getElementById('candidatesList');
const chainContainer = document.getElementById('chainContainer');

// --- LOGGING SYSTEM ---
function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    // Add timestamp
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `[${time}] ${message}`;

    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight; // Auto-scroll
}

// --- INITIALIZATION ---
async function init() {
    log("Initializing Blockchain Simulation...", "system");
    await votingSystem.initialize(log);
    renderChain();
}

// --- ADMIN ACTIONS ---
function addCandidate() {
    if (isElectionActive) {
        alert("Cannot add candidates after election starts!");
        return;
    }

    const nameInput = document.getElementById('candidateName');
    const partyInput = document.getElementById('partyName');
    const name = nameInput.value.trim();
    const party = partyInput.value.trim();

    if (!name || !party) {
        alert("Please enter both name and party.");
        return;
    }

    // Add to local state
    candidates[name] = { party: party, votes: 0 };

    // Update UI
    updateCandidateSelect();
    updateResults();

    log(`Admin added candidate: ${name} (${party})`, 'success');

    // Clear inputs
    nameInput.value = '';
    partyInput.value = '';
}

function startElection() {
    if (Object.keys(candidates).length === 0) {
        alert("Add candidates first!");
        return;
    }

    isElectionActive = true;

    // UI Updates
    document.getElementById('startBtn').disabled = true;
    document.getElementById('endBtn').disabled = false;
    document.getElementById('voteBtn').disabled = false;
    document.getElementById('candidateSelect').disabled = false;

    statusDiv.className = 'status-active';
    statusDiv.innerHTML = "Status: ELECTION ACTIVE - Blockchain Ready";

    log("User Trigger: Election Started.", "warning");
    log("Blockchain: Voting smart contract enabled. Mempool open.", "system");
}

async function endElection() {
    isElectionActive = false;

    // Disable inputs
    document.getElementById('endBtn').disabled = true;
    document.getElementById('voteBtn').disabled = true;
    document.getElementById('candidateSelect').disabled = true;

    statusDiv.className = 'status-ended';
    statusDiv.innerHTML = "Status: ELECTION ENDED - Mining final block...";

    log("User Trigger: Election Ended.", "warning");
    log("Blockchain: Closing mempool. Mining remaining votes...", "system");

    // Force mine any remaining votes
    await votingSystem.minePendingVotes(log);
    renderChain();

    log("Final Tally Verified. Election Closed.", "success");
    statusDiv.innerHTML = "Status: ELECTION ENDED - Results Finalized";
}

// --- VOTER ACTIONS ---
async function castVote() {
    if (!isElectionActive) {
        alert("Election is not active.");
        return;
    }

    const voterId = document.getElementById('voterId').value.trim();
    const candidateId = document.getElementById('candidateSelect').value;

    if (!voterId) {
        alert("Please enter Voter ID.");
        return;
    }
    if (!candidateId) {
        alert("Please select a candidate.");
        return;
    }

    log(`User Action: Voter ${voterId} submitting vote for ${candidateId}...`, 'info');

    try {
        // 1. Create Transaction
        const voteTx = new Transaction(voterId, candidateId);
        log("Blockchain: Transaction Created.", "system");

        // 2. Add to Mempool
        votingSystem.addVote(voteTx, log);

        // 3. Clear UI
        document.getElementById('voterId').value = '';
        document.getElementById('candidateSelect').value = '';

        // 4. AUTO-MINE for demonstration purposes
        // In reality, this happens periodically. Here we do it after a few votes OR immediately for feedback.
        // Let's mine every voting action to show the process clearly for the hackathon.
        log("Blockchain: Triggering Mining Process...", "warning");
        setTimeout(async () => {
            await votingSystem.minePendingVotes(log);
            updateResults(); // Update tally from blockchain data
            renderChain();   // Show new block
        }, 1000); // Small delay to separate events

    } catch (error) {
        log(`ERROR: ${error.message}`, 'warning');
        alert(error.message);
    }
}

// --- UI UPDATERS ---
function updateCandidateSelect() {
    const select = document.getElementById('candidateSelect');
    select.innerHTML = '<option value="" disabled selected>-- Select a Candidate --</option>';

    for (const [name, data] of Object.entries(candidates)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = `${name} (${data.party})`;
        select.appendChild(option);
    }
}

function updateResults() {
    // Recalculate votes strictly from blockchain history
    // Reset counts first
    for (let c in candidates) candidates[c].votes = 0;

    const allVotes = votingSystem.getAllVotes();
    allVotes.forEach(tx => {
        if (candidates[tx.candidateId]) {
            candidates[tx.candidateId].votes++;
        }
    });

    const list = document.getElementById('candidatesList');
    list.innerHTML = '';

    for (const [name, data] of Object.entries(candidates)) {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><strong>${name}</strong> (${data.party})</span>
            <span>${data.votes} votes</span>
        `;
        list.appendChild(li);
    }
}

function renderChain() {
    chainContainer.innerHTML = '';

    votingSystem.chain.forEach((block, index) => {
        const div = document.createElement('div');
        div.className = index === 0 ? 'block genesis' : 'block';
        div.innerHTML = `
            <strong>Block #${block.index}</strong><br>
            <span style="font-size:10px">${block.timestamp}</span><br>
            Tx: ${block.transactions.length}<br>
            Hash: <span style="font-size:10px">${block.hash.substring(0, 8)}...</span>
        `;
        chainContainer.appendChild(div);
    });
}

// Start
init();
