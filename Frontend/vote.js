console.log("✅ vote.js loaded");

let selectedCandidate = null;

// -------------------------------
// Load Candidates on Page Load
// -------------------------------
window.onload = fetchCandidates;

async function fetchCandidates() {
    const container = document.getElementById("candidateList");
    container.innerHTML = "<p>Loading candidates...</p>";

    try {
        const res = await fetch("/get-candidates");
        const data = await res.json();

        console.log("⬅ get-candidates response:", data);

        if (!data.candidates || data.candidates.length === 0) {
            container.innerHTML = "<p>No candidates available.</p>";
            return;
        }

        container.innerHTML = "";

        data.candidates.forEach(c => {
            const div = document.createElement("div");
            div.className = "candidate-card";

            div.innerHTML = `
                <label>
                    <input type="radio" name="candidate" value="${c.Candidate_ID}">
                    <b>${c.Candidate_Name}</b> (${c.Party_Name})
                </label>
            `;

            container.appendChild(div);
        });

        // Enable submit button ONLY after selection
        document.querySelectorAll('input[name="candidate"]').forEach(radio => {
            radio.addEventListener("change", (e) => {
                // ✅ IMPORTANT: convert to number
                selectedCandidate = parseInt(e.target.value);
                console.log("🎯 Candidate selected:", selectedCandidate);

                document.getElementById("submitVoteBtn").disabled = false;
            });
        });

    } catch (err) {
        console.error("❌ Error loading candidates:", err);
        container.innerHTML = "<p>Error loading candidates</p>";
    }
}

// -------------------------------
// Submit Vote
// -------------------------------
document.getElementById("voteForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedCandidate) {
        alert("Please select a candidate");
        return;
    }

    console.log("➡ Sending vote for candidate:", selectedCandidate);

    try {
        const res = await fetch("/cast-vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                candidate_id: selectedCandidate
            })
        });

        const data = await res.json();
        console.log("⬅ cast-vote response:", data);

        if (data.status === "success") {

            // Show popup with transaction hash (or receipt hash)
            let hash = data.tx_hash || data.receiptHash || data.hash || "N/A";

            alert(
                "✅ Vote cast successfully!\n\n" +
                "🧾 Save this for verification:\n" +
                "Transaction Hash:\n" + hash
            );

            // redirect
            window.location.href = "index.html";
        } else {
            alert(data.message || "❌ Voting failed");
        }

    } catch (err) {
        console.error("❌ cast-vote network error:", err);
        alert("❌ Network error while voting");
    }
});
