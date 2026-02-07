/**
 * BLOCKCHAIN VOTING SIMULATION - CORE LOGIC
 * This file contains the manual implementation of a blockchain.
 * NO LIBRARIES USED.
 */

// --- UTILITIES ---

/**
 * Calculates SHA-256 hash of a string using browser's crypto API.
 * This simulates the cryptographic security of the blockchain.
 */
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- CLASSES ---

/**
 * Transaction represents a single vote.
 */
class Transaction {
    constructor(voterId, candidateId) {
        this.voterId = voterId;
        this.candidateId = candidateId;
        this.timestamp = Date.now();
    }
}

/**
 * Block represents a set of votes mined together.
 */
class Block {
    constructor(index, timestamp, transactions, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions; // Array of Transaction objects
        this.previousHash = previousHash;
        this.hash = ''; // Will be calculated
        this.nonce = 0; // For Proof-of-Work
    }

    /**
     * Calculates the hash of the current block based on its properties.
     */
    async calculateHash() {
        // We combine all data into a string to sign
        const data = this.index + this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce;
        return await sha256(data);
    }

    /**
     * Mines the block (Proof-of-Work).
     * Finds a hash starting with 'difficulty' number of zeros.
     * @param {number} difficulty 
     * @param {function} logCallback - To update UI with progress
     */
    async mineBlock(difficulty, logCallback) {
        // Simplified check: we want the hash to start with "0" * difficulty
        const target = Array(difficulty + 1).join("0");
        
        this.hash = await this.calculateHash();

        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = await this.calculateHash();
            
            // Visual slowdown for simulation effect (avoid freezing UI)
            if (this.nonce % 50 === 0) {
                logCallback(` Mining... Nonce: ${this.nonce}, Hash: ${this.hash.substring(0, 15)}...`);
                await new Promise(r => setTimeout(r, 10)); // Tiny delay to let UI render
            }
        }

        logCallback(`BLOCK MINED: ${this.hash}`);
    }
}

/**
 * Blockchain manages the chain of blocks.
 */
class Blockchain {
    constructor() {
        this.chain = [];
        this.difficulty = 3; // Number of leading zeros required (keep low for demo)
        this.pendingTransactions = []; // Mempool
        this.voters = new Set(); // To prevent double voting
    }

    // Initialize with Genesis Block
    async initialize(logCallback) {
        const genesisBlock = new Block(0, Date.now(), [], "0");
        genesisBlock.hash = await genesisBlock.calculateHash();
        this.chain.push(genesisBlock);
        logCallback("Genesis Block created.");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Adds a vote to the mempool (pending transactions).
     */
    addVote(transaction, logCallback) {
        if (!transaction.voterId || !transaction.candidateId) {
            throw new Error('Vote must include voter ID and candidate ID');
        }

        // Validate: One vote per voter
        if (this.voters.has(transaction.voterId)) {
            throw new Error(`Voter ${transaction.voterId} has already voted!`);
        }

        this.pendingTransactions.push(transaction);
        this.voters.add(transaction.voterId);
        
        logCallback(`Vote added to Mempool: ${transaction.voterId} -> ${transaction.candidateId}`);
    }

    /**
     * Mines pending transactions into a new block.
     */
    async minePendingVotes(logCallback) {
        if (this.pendingTransactions.length === 0) {
            logCallback("No votes to mine.");
            return;
        }

        logCallback(`Starting mining process for ${this.pendingTransactions.length} votes...`);

        // Create new block
        let block = new Block(
            this.chain.length,
            Date.now(),
            this.pendingTransactions,
            this.getLatestBlock().hash
        );

        // Mine the block (perform Proof-of-Work)
        await block.mineBlock(this.difficulty, logCallback);

        // Add to chain
        logCallback("Block validation successful. Appending to chain.");
        this.chain.push(block);

        // Reset mempool
        this.pendingTransactions = [];
    }

    /**
     * Verifies the integrity of the blockchain.
     * (Simulates what other nodes would do)
     */
    async isChainValid(logCallback) {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // 1. Check if hash is correct (data hasn't changed)
            if (currentBlock.hash !== await currentBlock.calculateHash()) {
                logCallback(`INVALID CHAIN: Block ${i} hash corrupted!`);
                return false;
            }

            // 2. Check if it points to correct previous block (linkage)
            if (currentBlock.previousHash !== previousBlock.hash) {
                logCallback(`INVALID CHAIN: Block ${i} previous hash invalid!`);
                return false;
            }
        }
        logCallback("Blockchain Integrity Check: VALID");
        return true;
    }
    
    // Helper to get all votes for counting
    getAllVotes() {
        let allVotes = [];
        // Skip genesis block
        for(let i=1; i<this.chain.length; i++) {
             allVotes = allVotes.concat(this.chain[i].transactions);
        }
        return allVotes;
    }
}
