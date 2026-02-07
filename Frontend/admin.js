// =====================
// CONFIG
// =====================

// 👉 replace these with your deployed contract addresses
const EC_ADDRESS = "0xCb5d8302241E9A5A990D63859E2ee849d130F27D";
const VOTING_ADDRESS = "0x36Ec94E59C01B2419BeF8dE3c77B73e2A564E111";

// Global variables
let provider, signer, ecContract, votingContract;
let partyMap = {}; // { partyName: logoURL }

// =====================
// Load ABI JSON files
// =====================
async function loadABIs() {
    const ecRes = await fetch("EC_ABI.json");
    const votingRes = await fetch("VotingABI.json");

    if (!ecRes.ok || !votingRes.ok) {
        throw new Error("Failed to load ABI files");
    }

    const EC_ABI = await ecRes.json();
    const VOTING_ABI = await votingRes.json();

    return { EC_ABI, VOTING_ABI };
}

// =====================
// Connect Wallet & Init Contracts (ONCE)
// =====================
async function connectWallet() {
    const status = document.getElementById("wallet-status");
    if (status) status.innerText = "🔄 Connecting...";

    if (!window.ethereum) {
        alert("Please install MetaMask");
        return;
    }

    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }]
        });
    }

    const { EC_ABI, VOTING_ABI } = await loadABIs();

    ecContract = new ethers.Contract(EC_ADDRESS, EC_ABI, signer);
    votingContract = new ethers.Contract(VOTING_ADDRESS, VOTING_ABI, signer);

    if (status) status.innerText = "🟢 Wallet Connected";

    await loadPartyMap();
    await handleVotingControls();
    await checkVotingStatus();
}

window.connectWallet = connectWallet;

// =====================
// RESET VOTING + FACE CACHE (ADMIN ONLY)
// =====================
async function resetFaceCache() {
    try {
        // ensure contracts loaded
        if (!ecContract || !votingContract) {
            alert("Contracts not initialized");
            return;
        }

        // voting must be ended
        const ended = await ecContract.votingEnded();
        if (!ended) {
            alert("❌ Voting must be ended before reset");
            return;
        }

        // admin check
        const adminOnChain = await ecContract.electionCommission();
        const signerAddr = await signer.getAddress();

        if (adminOnChain.toLowerCase() !== signerAddr.toLowerCase()) {
            alert("❌ Only Election Commission can reset");
            return;
        }


        // reset blockchain (hasVoted → false)
        const tx = await votingContract.resetVotingRecords();
        await tx.wait();

        // reset face cache (backend)
        await fetch("http://127.0.0.1:5000/reset-face-cache", {
            method: "POST"
        });

        alert("✅ Voting & Face Cache reset successfully");

    } catch (err) {
        console.error(err);
        alert("❌ Reset failed: " + err.message);
    }
}


window.resetFaceCache = resetFaceCache;



// =====================
// Load parties dropdown (for Add Candidate page)
// =====================
async function loadPartiesDropdown() {
    const dropdown = document.getElementById("candidateParty");
    if (!dropdown || !ecContract) return;

    try {
        const result = await ecContract.getAllParties();
        const names = result[1];

        dropdown.length = 1;

        names.forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.text = name;
            dropdown.add(option);
        });
    } catch (err) {
        console.error("Failed to load parties for dropdown", err);
    }
}
window.loadPartiesDropdown = loadPartiesDropdown;

// =====================
// ADMIN — Start / Stop Voting
// =====================
async function startVoting() {
    try {
        const tx = await ecContract.start_voting();
        await tx.wait();

        alert("✅ Voting started");

        // Notify backend to broadcast SMS
        fetch("/notify-voting-start", { method: "POST" });

        await checkVotingStatus();
        await handleVotingControls();

    } catch (err) {
        console.error(err);
        alert("❌ Could not start voting");
    }
}


async function endVoting() {
    try {
        const tx = await ecContract.end_voting();
        await tx.wait();

        alert("⛔ Voting ended");

        // Notify backend to broadcast SMS
        fetch("/notify-voting-end", { method: "POST" });

        await checkVotingStatus();
        await handleVotingControls();

    } catch (err) {
        console.error(err);
        alert("❌ Could not end voting");
    }
}

window.startVoting = startVoting;
window.endVoting = endVoting;

// =====================
// Load Party Map for logo lookup
// =====================
async function loadPartyMap() {
    try {
        const partyData = await ecContract.getAllParties();
        const names = partyData[1];
        const logos = partyData[4];

        partyMap = {};
        for (let i = 0; i < names.length; i++) {
            partyMap[names[i]] = logos[i];
        }
    } catch (err) {
        console.error("Failed to load party logos", err);
    }
}

// =====================
// Show or hide results input/buttons based on voting status
// =====================
async function handleVotingControls() {
    const started = await ecContract.votingStarted();
    const ended = await ecContract.votingEnded();
    const controls = document.getElementById("resultsControls");
    const table = document.getElementById("resultsTable");
    const tableBody = document.getElementById("resultsTableBody");

    if (started && !ended) {
        // Hide inputs/buttons and table headers
        if (controls) controls.style.display = "none";
        if (table) table.classList.add("hidden");

        // Show locked message in table body
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;color:#c0392b;font-weight:bold;">
                        Results can be revealed only after the voting period ends.
                    </td>
                </tr>
            `;
        }
    } else {
        // Show controls and table headers
        if (controls) controls.style.display = "block";
        if (table) table.classList.remove("hidden");
        if (tableBody) tableBody.innerHTML = ""; // clear previous rows
    }
}


// =====================
// RESULTS PAGE
// =====================
async function viewResults() {
    const booth = document.getElementById("searchBoothId").value.trim();
    const tableBody = document.getElementById("resultsTableBody");

    if (!booth) {
        alert("Enter booth ID");
        return;
    }

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>`;

    try {
        const result = await ecContract.getCandidatesByBooth(booth);
        const ids = result[0];
        const names = result[1];
        const parties = result[2];

        if (ids.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center;">No candidates found.</td>
                </tr>
            `;
            return;
        }

        let rows = "";
        for (let i = 0; i < ids.length; i++) {
            const votes = await votingContract.getVoteCount(booth, ids[i]);
            const logo = partyMap[parties[i]] || "images/no-logo.png";

            rows += `
                <tr>
                    <td>${ids[i]}</td>
                    <td>${names[i]}</td>
                    <td>${parties[i]}</td>
                    <td><img src="${logo}" style="width:50px;height:50px;border-radius:8px;border:1px solid #ddd;"></td>
                    <td>${votes}</td>
                </tr>
            `;
        }

        tableBody.innerHTML = rows;

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="color:red;text-align:center;">
                    Failed to load results
                </td>
            </tr>
        `;
    }
}
window.viewResults = viewResults;

// =====================
// Remove party
// =====================
async function removeParty(partyId) {
    if (!confirm("Are you sure you want to delete this party?")) return;

    try {
        const tx = await ecContract.removeParty(partyId);
        await tx.wait();
        alert("✅ Party removed successfully!");
        if (document.getElementById("partyList")) {
            await loadPartiesDropdown();
        }
    } catch (err) {
        console.error(err);
        alert("❌ Failed to remove party");
    }
}
window.removeParty = removeParty;

// =====================
// ADD CANDIDATE
// =====================
async function addCandidate() {
    const booth = document.getElementById("boothId").value.trim();
    const id = document.getElementById("candidateId").value.trim();
    const name = document.getElementById("candidateName").value.trim();
    const party = document.getElementById("candidateParty").value.trim();

    if (!booth || !id || !name || !party) {
        alert("Fill all fields");
        return;
    }

    try {
        const tx = await ecContract.addCandidate(booth, Number(id), name, party);
        await tx.wait();
        alert("✅ Candidate added!");
        document.getElementById("boothId").value = "";
        document.getElementById("candidateId").value = "";
        document.getElementById("candidateName").value = "";
        document.getElementById("candidateParty").value = "";
    } catch (err) {
        console.error(err);
        alert("❌ Failed to add candidate");
    }
}
window.addCandidate = addCandidate;

// =====================
// VIEW CANDIDATES BY BOOTH
// =====================
async function viewCandidates() {
    const boothId = document.getElementById("searchBoothId").value.trim();
    const tableBody = document.getElementById("candidatesTableBody");

    if (!boothId) {
        alert("Enter booth ID");
        return;
    }

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading candidates...</td></tr>`;

    try {
        const result = await ecContract.getCandidatesByBooth(boothId);
        const ids = result[0];
        const names = result[1];
        const parties = result[2];
        const votes = result[3];

        const partyData = await ecContract.getAllParties();
        const partyNames = partyData[1];
        const partyLogos = partyData[4];

        function getLogo(partyName) {
            const i = partyNames.indexOf(partyName);
            return i !== -1 ? partyLogos[i] : "";
        }

        if (ids.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#777;">No candidates found for this booth.</td></tr>`;
            return;
        }

        let rows = "";
        for (let i = 0; i < ids.length; i++) {
            const logo = getLogo(parties[i]);
            rows += `
                <tr>
                    <td>${ids[i]}</td>
                    <td>${names[i]}</td>
                    <td>${parties[i]}</td>
                    <td>${logo ? `<img src="${logo}" style="width:45px;height:45px;border-radius:8px;border:1px solid #ddd;">` : "—"}</td>
                    <td>${votes[i]}</td>
                </tr>
            `;
        }

        tableBody.innerHTML = rows;

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center;">Failed to load candidates.</td></tr>`;
    }
}
window.viewCandidates = viewCandidates;

// =====================
// Voting Status (Voting-Control page)
// =====================
async function checkVotingStatus() {
    const statusEl = document.getElementById("votingStatus");
    if (!statusEl || !ecContract) return;

    try {
        const started = await ecContract.votingStarted();
        const ended = await ecContract.votingEnded();

        if (started && !ended) {
            statusEl.innerHTML = "🟢 Voting is ACTIVE";
            statusEl.style.color = "green";
        } else {
            statusEl.innerHTML = "🔴 Voting is NOT ACTIVE";
            statusEl.style.color = "red";
        }
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = "⚠️ Unable to fetch status";
        statusEl.style.color = "orange";
    }
}
window.checkVotingStatus = checkVotingStatus;

// =====================
// On Page Load
// =====================
window.addEventListener("load", async () => {
    await connectWallet();

    // Show/hide results controls based on voting status
    if (ecContract) {
        await handleVotingControls();
    }
});





window.addEventListener("load", async () => {
    await connectWallet();

    if (document.getElementById("candidateParty")) {
        await loadPartiesDropdown();
    }

    if (document.getElementById("votingStatus")) {
        setTimeout(checkVotingStatus, 500);
    }

    // Show/hide results controls based on voting status
    if (ecContract) {
        await handleVotingControls();
    }
});

