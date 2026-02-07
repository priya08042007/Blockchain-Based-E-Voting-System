const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' })); // handle big base64 images

const csvPath = path.join(__dirname, 'Dataset/polling_stations/party_info.csv');

app.post('/add-party', (req, res) => {
    const { name, leader, desc, logoBase64 } = req.body;

    if (!name || !leader || !desc || !logoBase64) {
        return res.status(400).json({ message: "Missing fields" });
    }

    // If file doesn't exist, create with header
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, "Party Name,Leader,Description,Logo\n");
    }

    // Append new row
    const row = `"${name}","${leader}","${desc}","${logoBase64}"\n`;
    fs.appendFileSync(csvPath, row);

    res.json({ message: "Party added successfully" });
});

app.listen(3000, () => console.log("Server running on port 3000"));
