const path = require("path");
const fs = require("fs");
const solc = require("solc");

const contractPath = path.resolve(__dirname, "../contracts/ElectionCommitReveal.sol");
const source = fs.readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "ElectionCommitReveal.sol": { content: source }
  },
  settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } } }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const abi = output.contracts["ElectionCommitReveal.sol"]["ElectionCommitReveal"].abi;
const bytecode = output.contracts["ElectionCommitReveal.sol"]["ElectionCommitReveal"].evm.bytecode.object;

fs.writeFileSync("build/ElectionCommitReveal.abi", JSON.stringify(abi));
fs.writeFileSync("build/ElectionCommitReveal.bin", bytecode);
