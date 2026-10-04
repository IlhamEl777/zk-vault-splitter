import { ethers } from "ethers";
import { createDeposit, ZKTree, generateProofAndCalldata } from "../src/zk-utils";
import fs from "fs";
import path from "path";

async function main() {
  console.log("================================================================================");
  console.log("   UJI COBA DE-ANONYMISASI: SKENARIO ANONYMITY SET COLLAPSE (k = 1)             ");
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

  const vault: any = new ethers.Contract(deployedInfo.vaultAddress, vaultArtifact.abi, deployer);

  // Set unique denomination 7.77 ETH
  const uniqueEth = "7.77";
  console.log(`📌 1. Mengubah Denominasi Brankas menjadi angka unik: ${uniqueEth} ETH...`);
  const setDenomTx = await vault.setDenomination(ethers.parseEther(uniqueEth));
  await setDenomTx.wait();

  console.log("📌 2. Alice menyetor 7.77 ETH ke Brankas...");
  const dep = await createDeposit();
  const tx = await vault.connect(alice).deposit(dep.deposit.commitment, {
    value: ethers.parseEther(uniqueEth),
  });
  await tx.wait();
  console.log(`   ✅ Setoran Alice sukses! Tx: ${tx.hash}`);

  // Re-sync tree
  console.log("\n🌲 3. Sinkronisasi Pohon Merkle...");
  const depositFilter = vault.filters.Deposit();
  const events = await vault.queryFilter(depositFilter, 0, "latest");
  const zkTree = new ZKTree(8, dep.poseidon);

  let leafIndex = -1;
  for (let i = 0; i < events.length; i++) {
    // @ts-ignore
    const commitment = BigInt(events[i].args[0].toString());
    const idx = zkTree.insert(commitment);
    if (commitment === dep.deposit.commitment) {
      leafIndex = idx;
    }
  }

  console.log(`   ✅ Daun Alice diindex #${leafIndex} (Total ${zkTree.leaves.length} daun).`);

  console.log("⚡ 4. Membuat Bukti ZK Groth16 untuk pencairan Alice...");
  const recipients = [bob.address, charlie.address, dave.address, eve.address];
  const merkleProof = zkTree.generateProof(leafIndex);

  const wasmPath = path.join(__dirname, "../build/splitter_js/splitter.wasm");
  const zkeyPath = path.join(__dirname, "../build/splitter_final.zkey");

  const proofData = await generateProofAndCalldata(
    dep.deposit,
    merkleProof,
    recipients,
    wasmPath,
    zkeyPath
  );

  console.log("🚚 5. Relayer mencairkan dana 7.77 ETH ke 4 dompet pener (@ 1.9425 ETH)...");
  const withdrawTx = await vault.connect(relayer).withdrawSplit(
    proofData.pA,
    proofData.pB,
    proofData.pC,
    merkleProof.root,
    dep.deposit.nullifierHash,
    recipients
  );
  const receipt = await withdrawTx.wait();

  console.log(`\n🎉 Pencairan Berhasil! Tx: ${receipt?.hash}`);
  console.log(`👉 Menjalankan Audit Forensik Otomatis...\n`);
}

main().catch(console.error);
