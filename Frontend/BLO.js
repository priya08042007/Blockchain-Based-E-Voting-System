if (!localStorage.getItem("bloId")) {
    alert("❌ Unauthorized access");
    window.location.href = "BLO.html";
}

const boothId = localStorage.getItem("bloBoothId");

if (!boothId) {
    alert("❌ Booth ID not found. Please login again.");
    window.location.href = "BLO.html";
}

document.getElementById("boothInfo").innerText =
    "Polling Booth ID: " + boothId;

/* ---------- GLOBALS ---------- */
let allVoters = [];
let addModal = null;

/* ---------- PAGE LOAD ---------- */
window.onload = () => {
    addModal = document.getElementById("addModal");
    loadVoters();
};

/* ---------- LOAD VOTERS ---------- */
async function loadVoters() {
    try {
        const res = await fetch(`http://127.0.0.1:5000/get-voters/${boothId}`);
        const data = await res.json();

        if (data.status !== "success") {
            alert("❌ Failed to load voters");
            return;
        }

        allVoters = data.voters;
        renderTable(allVoters);

    } catch (err) {
        console.error("❌ Load voters error:", err);
        alert("❌ Server not reachable");
    }
}

/* ---------- RENDER TABLE ---------- */
function renderTable(voters) {
    const table = document.getElementById("voterTable");
    table.innerHTML = "";

    if (!voters || voters.length === 0) {
        table.innerHTML = `<tr><td colspan="14">No voters found</td></tr>`;
        return;
    }

    voters.forEach(v => {
        table.innerHTML += `
        <tr>
            <td><b>${v.EPIC_ID}</b></td>

            <td contenteditable="true">${v.Name}</td>
            <td contenteditable="true">${v.Gender}</td>
            <td contenteditable="true">${v.Age}</td>
            <td contenteditable="true">${v.Phone_Number}</td>
            <td contenteditable="true">${v.Relation}</td>
            <td contenteditable="true">${v.Assembly_Constituency}</td>
            <td contenteditable="true">${v.Polling_Station_Name}</td>
            <td contenteditable="true">${v.Polling_Booth_ID}</td>
            <td contenteditable="true">${v.Part_Number}</td>
            <td contenteditable="true">${v.Serial_Number}</td>
            <td contenteditable="true">${v.State}</td>
            <td contenteditable="true">${v.District}</td>

            <td>
                <button onclick="save(this, '${v.EPIC_ID}')">💾</button>
                <button onclick="removeVoter('${v.EPIC_ID}')">🗑</button>
            </td>
        </tr>`;
    });
}


/* ---------- SEARCH ---------- */
function searchVoter() {
    const epic = document.getElementById("searchEpic").value
        .trim()
        .toUpperCase();

    if (!epic) {
        renderTable(allVoters);
        return;
    }

    const filtered = allVoters.filter(v =>
        v.EPIC_ID.toUpperCase().includes(epic)
    );

    renderTable(filtered);
}

/* ---------- UPDATE VOTER ---------- */
async function save(btn, epic) {
    const row = btn.parentElement.parentElement;
    const cells = row.children;

    const voter = {
        EPIC_ID: epic,                        // 🔒 locked
        Name: cells[1].innerText.trim(),
        Gender: cells[2].innerText.trim(),
        Age: cells[3].innerText.trim(),
        Phone_Number: cells[4].innerText.trim(),
        Relation: cells[5].innerText.trim(),
        Assembly_Constituency: cells[6].innerText.trim(),
        Polling_Station_Name: cells[7].innerText.trim(),
        Polling_Booth_ID: cells[8].innerText.trim(),
        Part_Number: cells[9].innerText.trim(),
        Serial_Number: cells[10].innerText.trim(),
        State: cells[11].innerText.trim(),
        District: cells[12].innerText.trim()
    };

    try {
        const res = await fetch("http://127.0.0.1:5000/update-voter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(voter)
        });

        const data = await res.json();

        if (data.status === "success") {
            alert("✅ Voter updated");
            loadVoters();
        } else {
            alert("❌ " + data.message);
        }

    } catch (err) {
        console.error("❌ Update error:", err);
        alert("❌ Failed to update voter");
    }
}


/* ---------- DELETE VOTER ---------- */
async function removeVoter(epic) {
    if (!confirm("Delete voter permanently?")) return;

    try {
        await fetch(`http://127.0.0.1:5000/delete-voter/${epic}`, {
            method: "DELETE"
        });

        alert("🗑 Voter deleted");
        loadVoters();

    } catch (err) {
        console.error("❌ Delete error:", err);
        alert("❌ Failed to delete voter");
    }
}
async function loadApprovals() {
    const res = await fetch(`http://127.0.0.1:5000/get-approvals/${boothId}`);
    const data = await res.json();

    const table = document.getElementById("approvalTable");
    table.innerHTML = "";

    if (data.requests.length === 0) {
        table.innerHTML = "<tr><td colspan='5'>No pending requests</td></tr>";
        return;
    }

    data.requests.forEach(r => {
        table.innerHTML += `
        <tr>
            <td>${r.EPIC_ID}</td>
            <td>${r.Old_Name} → <b>${r.New_Name}</b></td>
            <td>${r.Old_Age} → <b>${r.New_Age}</b></td>
            <td>${r.Old_Phone} → <b>${r.New_Phone}</b></td>
            <td>
                <button onclick='approveRequest(${JSON.stringify(r)})'>✅ Approve</button>
                <button onclick='rejectRequest("${r.EPIC_ID}")'>❌ Reject</button>
            </td>
        </tr>`;
    });
}

function approveRequest(r) {
    fetch("http://127.0.0.1:5000/approve-request", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(r)
    })
    .then(res => res.json())
    .then(() => loadApprovals());
}
function rejectRequest(epic) {
    fetch("http://127.0.0.1:5000/reject-request", { 
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ EPIC_ID: epic })
    })
    .then(res => res.json())
    .then(() => loadApprovals());
}
/* ---------- ADD MODAL ---------- */
function openAddForm() {
    addModal.style.display = "block";
}

function closeAddForm() {
    addModal.style.display = "none";
}

/* ---------- ADD NEW VOTER ---------- */
async function addVoter() {
    const voter = {
        EPIC_ID: EPIC_ID.value.trim(),
        Name: Name.value.trim(),
        Gender: Gender.value.trim(),
        Age: Age.value.trim(),
        Phone_Number: Phone_Number.value.trim(),
        Relation: Relation.value.trim(),
        Assembly_Constituency: Assembly_Constituency.value.trim(),
        Polling_Station_Name: Polling_Station_Name.value.trim(),
        Polling_Booth_ID: boothId,
        Part_Number: Part_Number.value.trim(),
        Serial_Number: Serial_Number.value.trim(),
        State: State.value.trim(),
        District: District.value.trim()
    };

    try {
        const res = await fetch("http://127.0.0.1:5000/add-voter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(voter)
        });

        const data = await res.json();

        if (data.status === "success") {
            alert("✅ Voter added successfully");
            closeAddForm();
            loadVoters();
        } else {
            alert("❌ " + data.message);
        }

    } catch (err) {
        console.error("❌ Add voter error:", err);
        alert("❌ Failed to add voter");
    }
}

/* ---------- LOGOUT ---------- */
function logout() {
    localStorage.clear();
    window.location.href = "BLO.html";
}
