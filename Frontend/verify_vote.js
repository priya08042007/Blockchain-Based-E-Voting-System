const epic = localStorage.getItem("verifyEpic");

if (!epic) {
    alert("❌ Please login first");
    window.location.href = "users.html";
}

// Start camera feed

/* ---------------- FACE VERIFICATION ---------------- */
function verifyFace() {
    fetch("http://127.0.0.1:5000/start-camera");
    const faceStatus = document.getElementById("faceStatus");
    faceStatus.innerText = "🔍 Verifying face...";

    fetch("http://127.0.0.1:5000/verify-vote-face", {
        method: "POST"
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === "verified") {
                faceStatus.innerText = "✅ Face verified successfully";
                document.getElementById("hashSection").classList.remove("hidden");
            }
            else if (data.status === "no_face") {
                faceStatus.innerText = "❌ No face detected. Look at camera.";
            }
            else if (data.status === "not_registered") {
                faceStatus.innerText = "❌ Face dataset not found for EPIC.";
            }
            else {
                faceStatus.innerText = "❌ Face mismatch. Adjust lighting.";
            }
        })
        .catch(() => {
            faceStatus.innerText = "❌ Server error during face verification";
        });
}

/* ---------------- VERIFY VOTE BY HASH ---------------- */

async function verifyVote() {
    const hashKey = document.getElementById("hashInput").value.trim();
    const resultDiv = document.getElementById("verifyResult");

    if (!hashKey) {
        resultDiv.innerText = "❌ Please enter hash key";
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:5000/verify-vote-by-hash", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashKey })
        });


        const data = await res.json();

        if (data.status === "success") {
            resultDiv.innerHTML = `
                <h3>✅ Vote Verified</h3>
                <p><b>Booth ID:</b> ${data.booth_id}</p>
                <p><b>Candidate:</b> ${data.candidate_name}</p>
                <p><b>Party:</b> ${data.party}</p>
                <p><b>Candidate ID:</b> ${data.candidate_id}</p>
            `;
        } else {
            resultDiv.innerText = "❌ " + data.message;
        }

    } catch (err) {
        resultDiv.innerText = "⚠ Network error";
    }
}



/* ---------------- EXIT ---------------- */
function goBack() {
    fetch("http://127.0.0.1:5000/stop-camera");
    window.location.href = "users.html";
}
function stopCamera() {
    fetch("http://127.0.0.1:5000/stop-camera");
    document.getElementById("faceStatus").innerText = "📷 Camera stopped";
}

window.addEventListener("load", () => {
    startCamera();
});

function startCamera() {
    fetch("http://127.0.0.1:5000/start-camera")
        .then(() => {
            const cam = document.querySelector(".camera");
            // force reload stream
            cam.src = "http://127.0.0.1:5000/video-feed?t=" + new Date().getTime();
        });
}
