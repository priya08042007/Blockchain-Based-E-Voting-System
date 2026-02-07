// let voters = [];
let selectedVoter = null;
let generatedOTP = null;

/* ---------- CSV PARSER (Handles Quotes & Commas) ---------- */
function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let char of text) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            row.push(value.trim());
            value = "";
        } else if (char === "\n" && !inQuotes) {
            row.push(value.trim());
            rows.push(row);
            row = [];
            value = "";
        } else {
            value += char;
        }
    }
    if (value) {
        row.push(value.trim());
        rows.push(row);
    }
    return rows;
}

// /* ---------- LOAD CSV ---------- */
// fetch("../DataSet/dummy_voters.csv")
//     .then(res => res.text())
//     .then(text => {
//         const data = parseCSV(text);
//         const headers = data[0];
//         const rows = data.slice(1);

//         voters = rows.map(r => {
//             let obj = {};
//             headers.forEach((h, i) => obj[h] = r[i]);
//             return obj;
//         });

//         console.log("✅ Voters Loaded:", voters);
//     });

/* ---------- UI TABS ---------- */
function showTab(id) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

    document.getElementById(id).classList.remove("hidden");
    event.target.classList.add("active");
}

function generateCaptcha(type) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let captcha = "";

    for (let i = 0; i < 5; i++) {
        captcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    if (type === "epic") {
        epicCaptcha = captcha;
        document.getElementById("epicCaptchaQ").innerText = captcha;
        document.getElementById("epicCaptchaA").value = "";
    } else {
        mobileCaptcha = captcha;
        document.getElementById("mobileCaptchaQ").innerText = captcha;
        document.getElementById("mobileCaptchaA").value = "";
    }
}

/* ---------- LOGIN ---------- */
function loginByEpic() {
    const epic = document.getElementById("epicInput").value.trim();
    const userCaptcha = document.getElementById("epicCaptchaA").value.trim();

    if (userCaptcha !== epicCaptcha) {
        alert("❌ Invalid CAPTCHA");
        generateCaptcha("epic");
        return;
    }

    fetch("http://127.0.0.1:5000/verify-epic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epic })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status !== "found") {
            alert("❌ EPIC ID not found");
            return;
        }

        selectedVoter = data.data;

        // store epic for verify vote page
        localStorage.setItem("verifyEpic", epic);

        showResult();
    })
    .catch(() => alert("❌ Server error"));
}



function sendOTP() {
    const mobile = mobileInput.value.trim();

    fetch("http://127.0.0.1:5000/send-otp", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ mobile })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status !== "sent") {
            alert("❌ Mobile not found");
            return;
        }
        otpBox.classList.remove("hidden");
        alert("OTP sent (check backend console)");
    });
}


function verifyOTP() {
    fetch("http://127.0.0.1:5000/verify-otp", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            mobile: mobileInput.value.trim(),
            otp: otpInput.value.trim()
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status !== "success") {
            alert("❌ Invalid OTP");
            return;
        }

        selectedVoter = data.data;
        localStorage.setItem("verifyEpic", selectedVoter.EPIC_ID);
        showResult();
    });
}




/* ---------- DISPLAY ---------- */
function showResult() {
    document.getElementById("result").classList.remove("hidden");

    nameField.value = selectedVoter.Name;
    ageField.value = selectedVoter.Age;
    mobileField.value = selectedVoter.Phone_Number;
    epicField.value = selectedVoter.EPIC_ID;
    genderField.value = selectedVoter.Gender;
    assemblyField.value = selectedVoter.Assembly_Constituency;
    pollingField.value = selectedVoter.Polling_Station_Name;
    stateField.value = selectedVoter.State;
    districtField.value = selectedVoter.District;
}
if (selectedVoter) {
    document.getElementById("boothId").value = selectedVoter.Polling_Booth_ID;
}

/* ---------- EDIT ---------- */
function enableEdit() {
    nameField.disabled = false;
    ageField.disabled = false;
    mobileField.disabled = false;

    editBtn.classList.add("hidden");
    submitBtn.classList.remove("hidden");
}

function submitEdit() {
    const request = {
        EPIC_ID: selectedVoter.EPIC_ID,
        Polling_Booth_ID: selectedVoter.Polling_Booth_ID, // ✅ read from CSV via selectedVoter

        Old_Name: selectedVoter.Name,
        New_Name: nameField.value,

        Old_Age: selectedVoter.Age,
        New_Age: ageField.value,

        Old_Phone: selectedVoter.Phone_Number,
        New_Phone: mobileField.value
    };

    fetch("http://127.0.0.1:5000/request-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "verified" || data.status === "success") {
            statusMsg.innerText = "✅ Request sent to BLO for approval";
            
        } else {
            alert("❌ " + data.message);
        }
    });
}


generateCaptcha("epic");
generateCaptcha("mobile");

function goToVerifyVote() {
    window.location.href = "verify_vote.html";
}