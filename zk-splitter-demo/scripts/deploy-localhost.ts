import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
// @ts-ignore
import { poseidonContract } from "circomlibjs";

async function main() {
  console.log("🚀 Deploying ZK-Splitter contracts to localhost network (http://127.0.0.1:8545)...");

  const [deployer, alice, bob, charlie, dave, eve, relayer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  // 1. Deploy Poseidon (2 inputs)
  const PoseidonABI = poseidonContract.generateABI(2);
  const PoseidonBytecode = poseidonContract.createCode(2);
  const PoseidonFactory = new ethers.ContractFactory(PoseidonABI, PoseidonBytecode, deployer);
  const poseidon = await PoseidonFactory.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();
  console.log(`✅ Poseidon Hasher deployed at: ${poseidonAddress}`);

  // 2. Deploy Groth16Verifier
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`✅ Groth16Verifier deployed at: ${verifierAddress}`);

  // 3. Deploy ZKVault
  const VaultFactory = await ethers.getContractFactory("ZKVault");
  const vault = await VaultFactory.deploy(verifierAddress, poseidonAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`✅ ZKVault deployed at: ${vaultAddress}`);

  const deployedInfo = {
    network: "localhost",
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 31337,
    poseidonAddress,
    verifierAddress,
    vaultAddress,
    denominationEth: "1.0",
    accounts: {
      deployer: deployer.address,
      alice: alice.address,
      bob: bob.address,
      charlie: charlie.address,
      dave: dave.address,
      eve: eve.address,
      relayer: relayer.address,
    },
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../deployed-contracts.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployedInfo, null, 2));
  console.log(`📄 Deployment info saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
