
import hre from "hardhat";

async function main() {
  const ethers = hre.ethers;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contract with account:", deployer.address);

  const candidates = ["Alice", "Bob", "Charlie"];
  const Election = await ethers.getContractFactory("ElectionCommitReveal");
  const election = await Election.deploy(candidates);

  await election.deployed();

  console.log("✅ Contract deployed at:", election.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
