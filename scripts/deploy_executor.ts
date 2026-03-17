import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with", deployer.address);

  // Deploy mock token for tests
  const ERC20Factory = await ethers.getContractFactory("MockERC20");
  console.log("Add your deploy steps here");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
