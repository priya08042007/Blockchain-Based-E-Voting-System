const Web3 = require("web3");
const file = require("./build/contracts/ElectionCommitReveal.json");

const web3 = new Web3("http://127.0.0.1:7545"); // Ganache local blockchain

const contract = new web3.eth.Contract(file.abi, "PASTE_DEPLOYED_ADDRESS_HERE");

module.exports = contract;
