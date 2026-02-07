# Blockchain E-Voting Simulation

This project is an **Educational Simulation** of a blockchain-based e-voting system used to demonstrate core blockchain concepts for a hackathon.

It completely simulates the internal workings of a blockchain (Mining, Hashing, Immutable Ledger) in pure JavaScript without external libraries.

## 🚀 How to Run
1. Open the folder `blockchain_voting_simulation`.
2. Double-click `index.html` to open it in any modern browser (Chrome/Edge/Firefox).
   - No server needed.
   - No installation (`npm install`) needed.

## 🧠 Core Concepts Demonstrated

### 1. Immutability
Every vote is a **Transaction**. Once a vote is included in a **Block** and mined, it receives a cryptographic **Hash**. Changing any past data would break the chain of hashes, alerting the system (visible in logs).

### 2. Proof-of-Work (Mining)
The simulation manually performs "Mining".
- You will see the backend trying to find a "Nonce" that results in a Hash starting with zeros (e.g., `000...`).
- This simulates the computational effort required to secure the network.

### 3. Decentralized Logic
- **Mempool**: Votes go to a temporary holding area first.
- **Blocks**: Votes are bundled into blocks.
- **Chaining**: Each block contains the hash of the previous block, creating the secure chain.

## 🎮 How to Use the Demo

### Step 1: Election Commission (Admin)
1. Add Candidates (e.g., "Alice" - "Red Party").
2. Click **Start Election**.
   - *Backend Log*: Shows the election contract initializing.

### Step 2: Voter Actions
1. Enter a **Voter ID** (e.g., "V-123").
2. Select a Candidate.
3. Click **VOTE**.

### Step 3: Observe the Blockchain
Look at the **Right Panel (Black Terminal)**:
1. **Transaction Created**: See the vote data.
2. **Added to Mempool**: Vote waits to be mined.
3. **Mining**: See the system "working" (The loop finding the hash).
4. **Block Added**: A new block appears in the visual chain at the bottom.

## 📂 Project Structure
- `blockchain.js`: Contains the raw `Block`, `Transaction`, and `Blockchain` classes.
- `app.js`: Connects the UI to the blockchain instance.
- `index.html`: The visual interface.
