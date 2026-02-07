async function addParty() {
    const name = document.getElementById("partyName").value.trim();
    const leader = document.getElementById("partyLeader").value.trim();
    const description = document.getElementById("partyDesc").value.trim(); // match HTML id
    const logoInput = document.getElementById("partyLogo");
    
    let logo = "";
    if (logoInput.files.length > 0) {
        const file = logoInput.files[0];
        logo = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result); // base64 string
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    if (!name) {
        alert("Party name is required");
        return;
    }

    try {
        const tx = await ecContract.addParty(
            name,
            leader,
            description,
            logo
        );
        await tx.wait();

        alert("✅ Party added on blockchain!");
    } catch (err) {
        console.error(err);
        alert("❌ Failed to add party");
    }
}
