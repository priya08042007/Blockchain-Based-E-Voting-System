import { ethers } from "ethers";
import fs from "fs";
import path from "path";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545"); // Ganache port
const privateKey = "0x061f57907de0cbae9d982c70de2e38bac112c624343416d62fdfdb34eb03c7ab";
const wallet = new ethers.Wallet(privateKey, provider);

// Load ABI + bytecode
const contractPath = path.resolve("./build/AdminVoting.json");
const { abi, bytecode } = JSON.parse(fs.readFileSync(contractPath, "utf8"));

// Deploy contract
export async function deployContract() {
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  console.log("✅ Contract deployed at:", contract.target);
  return contract;
}

// Add candidate
export async function addCandidate(contract, name) {
  const tx = await contract.addCandidate(name);
  await tx.wait();
  console.log("Added candidate:", name);
}

// Start voting
export async function startVoting(contract) {
  const tx = await contract.startVoting();
  await tx.wait();
  console.log("Voting started!");
}

// End voting
export async function endVoting(contract) {
  const tx = await contract.endVoting();
  await tx.wait();
  console.log("Voting ended!");
}

// Fetch candidates
export async function getCandidates(contract) {
  return await contract.getCandidates();
}
