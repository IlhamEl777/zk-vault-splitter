import { ethers } from "ethers";
import { createDeposit, ZKTree, generateProofAndCalldata } from "../src/zk-utils";
import fs from "fs";
import path from "path";

async function main() {
  console.log("================================================================================");
  console.log("       SIMULASI MULTI-TRANSAKSI UNTUK UJI COBA FORENSIK (k > 1)                 ");
  console.log("================================================================================\n");

  const deployedPath = path.join(__dirname, "../deployed-contracts.json");
  const deployedInfo = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));
  const vaultArtifactPath = path.join(__dirname, "../artifacts/contracts/ZKVault.sol/ZKVault.json");
  const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf-8"));

  const provider = new ethers.JsonRpcProvider(deployedInfo.rpcUrl || "http://127.0.0.1:8545");
  const [deployer, alice, bob, charlie, dave, eve, relayer] = await Promise.all([
    provider.getSigner(0),
    provider.getSigner(1),
    provider.getSigner(2),
    provider.getSigner(3),
    provider.getSigner(4),
    provider.getSigner(5),
    provider.getSigner(6),
  ]);

  const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultArtifact.abi, deployer);

  // Set denomination to 1.0 ETH
  const setDenomTx = await vault.setDenomination(ethers.parseEther("1.0"));
  await setDenomTx.wait();

  console.log("📌 1. Membuat Setoran #1 dari Alice (1.0 ETH)...");
  const dep1 = await createDeposit();
  const tx1 = await vault.connect(alice).deposit(dep1.deposit.commitment, {
    value: ethers.parseEther("1.0"),
  });
  await tx1.wait();
  console.log(`   ✅ Setoran #1 sukses! Tx: ${tx1.hash}`);

  console.log("📌 2. Membuat Setoran #2 dari Charlie (1.0 ETH) untuk memperbesar Anonymity Set...");
  const dep2 = await createDeposit();
  const tx2 = await vault.connect(charlie).deposit(dep2.deposit.commitment, {
    value: ethers.parseEther("1.0"),
  });
  await tx2.wait();
  console.log(`   ✅ Setoran #2 sukses! Tx: ${tx2.hash}`);

  console.log("\n🌲 3. Sinkronisasi seluruh daun Pohon Merkle dari smart contract...");
  const depositFilter = vault.filters.Deposit();
  const events = await vault.queryFilter(depositFilter, 0, "latest");
  const zkTree = new ZKTree(8, dep1.poseidon);

  let aliceLeafIndex = -1;
  for (let i = 0; i < events.length; i++) {
    // @ts-ignore
    const commitment = BigInt(events[i].args[0].toString());
    const idx = zkTree.insert(commitment);
    if (commitment === dep1.deposit.commitment) {
      aliceLeafIndex = idx;
    }
  }

  console.log(`   ✅ Pohon Merkle terisi ${zkTree.leaves.length} daun. Daun Alice berada pada index #${aliceLeafIndex}.`);

  console.log("⚡ 4. Menghasilkan Bukti ZK Groth16 untuk pencairan Setoran milik Alice...");
  const recipients = [bob.address, dave.address, eve.address, deployer.address];
  const merkleProof = zkTree.generateProof(aliceLeafIndex);

  const wasmPath = path.join(__dirname, "../build/splitter_js/splitter.wasm");
  const zkeyPath = path.join(__dirname, "../build/splitter_final.zkey");

  const proofData = await generateProofAndCalldata(
    dep1.deposit,
    merkleProof,
    recipients,
    wasmPath,
    zkeyPath
  );

  console.log("🚚 5. Relayer mengirim transaksi pencairan (withdrawSplit)...");
  const withdrawTx = await vault.connect(relayer).withdrawSplit(
    proofData.pA,
    proofData.pB,
    proofData.pC,
    merkleProof.root,
    dep1.deposit.nullifierHash,
    recipients
  );
  const receipt = await withdrawTx.wait();

  console.log(`\n🎉 Pencairan Berhasil di Jaringan Live Hardhat!`);
  console.log(`   Hash Transaksi Pencairan: ${receipt?.hash}`);
  console.log(`\n👉 Silakan jalankan audit forensik dengan:`);
  console.log(`   npx tsx scripts/investigate-tx.ts ${receipt?.hash}\n`);
}

main().catch(console.error);
