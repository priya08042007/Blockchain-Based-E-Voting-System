const voteBtn = document.getElementById("voteButton");
const statusText = document.getElementById("statusText");

// -------------------------------
// 🔒 Check Voting Status (GLOBAL GATE)
// -------------------------------

async function checkVotingStatus() {
    try {
        const res = await fetch('/voting-status');
        const data = await res.json();

        if (!data.started) {
            document.querySelector('.container').innerHTML = `
                <h2 style="color:red;">🛑 Voting has not started</h2>
                <p>Please wait for the Election Commission to start voting.</p>
            `;
            return false;
        }

        if (data.ended) {
            document.querySelector('.container').innerHTML = `
                <h2 style="color:red;">⛔ Voting has ended</h2>
                <p>Thank you for your participation.</p>
            `;
            return false;
        }
        return true;

    } catch (err) {
        console.error(err);
        document.querySelector('.container').innerHTML = `
            <h2 style="color:red;">⚠ Unable to check voting status</h2>
        `;
        return false;
    }
}

function autoSyncVotingStatus() {
    fetch("/voting-status")
        .then(res => res.json())
        .then(data => {
            console.log("📊 Voting status:", data);

            if (data.started && !data.ended) {
                voteBtn.disabled = false;
                statusText.innerText = "🟢 Voting Live";
            } 
            else if (!data.started) {
                voteBtn.disabled = true;
                statusText.innerText = "🔴 Voting Not Started";
            } 
            else if (data.ended) {
                voteBtn.disabled = true;
                statusText.innerText = "⛔ Voting has ended";
            }
        })
        .catch(err => {
            console.error(err);
            statusText.innerText = "⚠ Unable to fetch voting status";
        });
}


setInterval(autoSyncVotingStatus, 4000);
autoSyncVotingStatus();

function escapeHtml(unsafe) {
    return (unsafe + '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showLiveCamera() {
    const cam = document.getElementById('cameraFeed');
    cam.style.display = 'block';
    cam.src = '/video-feed?t=' + new Date().getTime();
}

// -------------------------------
// Verify EPIC
// -------------------------------
async function verifyEpic() {
    const allowed = await checkVotingStatus();
    if (!allowed) return;

    const epic = document.getElementById('epic').value.trim();
    const epicError = document.getElementById('epic-error');

    if (!epic) {
        epicError.innerText = 'Please enter EPIC number.';
        return;
    }

    epicError.innerText = 'Verifying...';

    try {
        const response = await fetch('/verify-epic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ epic })
        });

        const result = await response.json();

        if (result.status === 'not_found') {
            epicError.innerText = 'EPIC not found.';
        }
        else if (result.status === 'already_voted') {
            epicError.style.color = "red";
            epicError.innerText = "⚠ You already voted.";
        }
        else if (result.status === 'found') {
            epicError.innerText = '';
            showVoterInfo(result.data);
        }
        else {
            epicError.innerText = 'Unexpected server response.';
        }
    } catch {
        epicError.innerText = 'Network error.';
    }
}

// -------------------------------
// Show Voter Info
// -------------------------------
function showVoterInfo(data) {
    document.getElementById('epic-section').style.display = 'none';

    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `
        <h3>Voter Details</h3>
        <p><b>EPIC:</b> ${escapeHtml(data.EPIC_ID)}</p>
        <p><b>Name:</b> ${escapeHtml(data.Name)}</p>
        <p><b>Polling Booth:</b> ${escapeHtml(data.Polling_Booth_ID)}</p>
        <button id="goto-face">Go to Face Authentication</button>
        <button id="edit-epic" style="background:#777">Search Another EPIC</button>
    `;

    document.querySelector('.container').appendChild(infoDiv);

    document.getElementById('goto-face').onclick = () => {
        infoDiv.remove();
        document.getElementById('camera-section').style.display = 'block';
    };

    document.getElementById('edit-epic').onclick = () => location.reload();
}

// -------------------------------
// Face Detection
// -------------------------------
let faceIntervalId = null;

async function startFaceDetection() {
    const cameraError = document.getElementById('camera-error');
    cameraError.innerText = "📷 Starting camera...";

    try {
        await fetch('/start-camera');
        showLiveCamera();
        await new Promise(resolve => setTimeout(resolve, 800));
        cameraError.innerText = "🔍 Looking for face...";

        faceIntervalId = setInterval(async () => {
            const response = await fetch('/verify-face', { method: 'POST' });
            const result = await response.json();

            if (result.status === 'success') {
                cameraError.innerText = "✅ Face match successful!";
                document.getElementById('voteButton').style.display = 'block';
                stopFaceDetection();
            } 
            else if (result.status === "already_voted") {
                alert("⚠ You have already voted!");
                await stopFaceDetection();
                window.location.href = "index.html";
            }
            else if (result.status === 'failed') {
                cameraError.innerText = "❌ Face mismatch. Please look at the camera.";
            } 
            else if (result.status === 'no_face') {
                cameraError.innerText = "⚠ No face detected. Please look at the camera.";
            }
        }, 1000);

    } catch (err) {
        console.error(err);
        cameraError.innerText = "❌ Camera error.";
    }
}

async function stopFaceDetection() {
    const cameraError = document.getElementById('camera-error');

    if (faceIntervalId) {
        clearInterval(faceIntervalId);
        faceIntervalId = null;
    }

    await fetch('/stop-camera');
    document.getElementById('cameraFeed').style.display = 'none';
    cameraError.innerText = "🛑 Face detection stopped.";
}



// -------------------------------
// Show Voting Options
// -------------------------------
async function showVotingOptions() {
    const res = await fetch('/get-candidates');
    const data = await res.json();

    if (data.status === 'ok') {
        const container = document.getElementById('votingContainer');
        container.innerHTML = `<h3>Polling Station: ${data.polling_id}</h3>`;

        data.candidates.forEach(c => {
            const div = document.createElement('div');
            div.innerHTML = `
                <p>${c.Candidate_Name} (${c.Party_Name})</p>
                <button onclick="castVote('${c.Candidate_ID}')">Vote</button>
            `;
            container.appendChild(div);
        });
    }
}

// -------------------------------
// Cast Vote
// -------------------------------
async function castVote(candidateId) {
    console.log("➡ castVote() called with:", candidateId);

    try {
        const res = await fetch('/cast-vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidate_id: candidateId })
        });

        const data = await res.json();
        console.log("⬅ server replied:", data);

        if (data.status === 'success') {

            alert("✅ Vote submitted successfully!");
            window.location.href = "index.html";

        } else {
            alert(data.message || "Voting failed");
        }

    } catch (err) {
        console.error("❌ error in castVote:", err);
        alert("Voting failed due to network error");
    }
}

window.onload = checkVotingStatus;

function goToVotePage() {
    window.location.href = "vote.html";
}
