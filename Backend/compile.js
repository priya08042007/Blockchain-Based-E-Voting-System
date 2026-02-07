import fs from "fs";
import solc from "solc";
import path from "path";

const contractPath = path.resolve("./contracts/AdminVoting.sol");
const source = fs.readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "AdminVoting.sol": {
      content: source,
    },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contract = output.contracts["AdminVoting.sol"]["AdminVoting"];

// Write ABI and bytecode to build folder
const buildPath = path.resolve("./build");
if (!fs.existsSync(buildPath)) fs.mkdirSync(buildPath);

fs.writeFileSync(
  path.resolve(buildPath, "AdminVoting.json"),
  JSON.stringify({
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  }, null, 2)
);

console.log("✅ Contract compiled successfully!");
