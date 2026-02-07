/* ---------- BLO LOGIN ---------- */
async function bloLogin() {
    const bloId = document.getElementById("bloId").value.trim();
    const password = document.getElementById("bloPassword").value.trim();

    if (!bloId || !password) {
        alert("❌ Enter BLO ID and Password");
        return;
    }

    try {
        const res = await fetch("http://127.0.0.1:5000/blo-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                blo_id: bloId,
                password: password
            })
        });

        const data = await res.json();

        if (data.status === "success") {
            localStorage.setItem("bloId", bloId);
            localStorage.setItem("bloBoothId", data.Polling_Booth_ID);

            window.location.href = "blo_dashboard.html";
        } else {
            alert("❌ Invalid BLO credentials");
        }

    } catch (err) {
        console.error("❌ Login error:", err);
        alert("❌ Server not reachable");
    }
}
