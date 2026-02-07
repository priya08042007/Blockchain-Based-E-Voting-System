// const express = require("express");
// const cors = require("cors");
// const bodyParser = require("body-parser");
// const contract = require("./blockchain");
// const web3 = require("web3");

// const app = express();
// const port = 5000;

// app.use(cors());
// app.use(bodyParser.json());

// // -------------------------
// // ADMIN CONTROLS
// // -------------------------

// app.post("/start-voting", async (req, res) => {
//     try {
//         const { adminAddress } = req.body;
//         await contract.methods.startVoting().send({ from: adminAddress, gas: 3000000 });
//         res.json({ message: "Voting started successfully!" });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Failed to start voting" });
//     }
// });

// app.post("/stop-voting", async (req, res) => {
//     try {
//         const { adminAddress } = req.body;
//         await contract.methods.stopVoting().send({ from: adminAddress, gas: 3000000 });
//         res.json({ message: "Voting stopped successfully!" });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Failed to stop voting" });
//     }
// });

// app.post("/add-candidate", async (req, res) => {
//     try {
//         const { name, boothId, adminAddress } = req.body;
//         await contract.methods.addCandidate(name, boothId).send({ from: adminAddress, gas: 3000000 });
//         res.json({ message: "Candidate added successfully" });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Error adding candidate" });
//     }
// });

// // -------------------------
// // GENERAL NODE (VOTER) ENDPOINTS
// // -------------------------

// app.post("/cast-vote", async (req, res) => {
//     try {
//         const { candidateIndex, voterAddress } = req.body;
//         await contract.methods.castVote(candidateIndex).send({ from: voterAddress, gas: 3000000 });
//         res.json({ message: "Vote casted!" });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: "Unable to cast vote" });
//     }
// });

// // -------------------------

// app.listen(port, () => {
//     console.log(`Backend running at http://localhost:${port}`);
// });

import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";

const app = express();
app.use(bodyParser.json());

// ------------------------
// Setup blockchain provider
// ------------------------
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545"); // Ganache
const adminPrivateKey = "0x061f57907de0cbae9d982c70de2e38bac112c624343416d62fdfdb34eb03c7ab"; // replace with Ganache admin key
const wallet = new ethers.Wallet(adminPrivateKey, provider);

// Load ABI + bytecode
const contractPath = path.resolve("./build/AdminVoting.json");
const { abi, bytecode } = JSON.parse(fs.readFileSync(contractPath, "utf8"));

let contract;

// ------------------------
// Deploy contract (once)
// ------------------------
async function deployContract() {
  if (!contract) {
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    contract = await factory.deploy();
    await contract.waitForDeployment();
    console.log("✅ Contract deployed at:", contract.target);
  }
}
deployContract();

// ------------------------
// Middleware to check admin
// ------------------------
function checkAdmin(req, res, next) {
  const { adminAddress } = req.body;
  if (!adminAddress || adminAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    return res.status(403).json({ message: "Only admin can perform this action" });
  }
  next();
}

// ------------------------
// API Endpoints
// ------------------------

// Start voting
app.post("/start-voting", checkAdmin, async (req, res) => {
  try {
    const tx = await contract.startVoting();
    await tx.wait();
    res.json({ message: "Voting started!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Stop voting
app.post("/stop-voting", checkAdmin, async (req, res) => {
  try {
    const tx = await contract.endVoting();
    await tx.wait();
    res.json({ message: "Voting stopped!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add candidate
app.post("/add-candidate", checkAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Candidate name required" });

    const tx = await contract.addCandidate(name);
    await tx.wait();
    res.json({ message: `Candidate ${name} added!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get candidates
app.get("/get-candidates", async (req, res) => {
  try {
    const candidates = await contract.getCandidates();
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ------------------------
app.listen(5000, () => console.log("Server running on http://localhost:5000"));