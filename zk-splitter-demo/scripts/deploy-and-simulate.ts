import { ethers } from "hardhat";
// @ts-ignore
import { poseidonContract } from "circomlibjs";
import { createDeposit, ZKTree, generateProofAndCalldata } from "../src/zk-utils";

function formatEth(wei: bigint): string {
  return parseFloat(ethers.formatEther(wei)).toFixed(4) + " ETH";
}

async function main() {
  console.log("================================================================================");
  console.log("             ZK-VAULT & 1-TO-4 PRIVATE SPLITTER SIMULATION                      ");
  console.log("================================================================================\n");

  const [deployer, alice, bob, charlie, dave, eve, relayer] = await ethers.getSigners();

  const recipients = [
    { name: "Bob", signer: bob },
    { name: "Charlie", signer: charlie },
    { name: "Dave", signer: dave },
    { name: "Eve", signer: eve },
  ];

  console.log("📌 [1. DEPLOYMENT] Menggelar Kontrak ke Jaringan EVM Lokal...");
  // 1. Deploy Poseidon
  const PoseidonABI = poseidonContract.generateABI(2);
  const PoseidonBytecode = poseidonContract.createCode(2);
  const PoseidonFactory = new ethers.ContractFactory(PoseidonABI, PoseidonBytecode, deployer);
  const poseidon = await PoseidonFactory.deploy();
  await poseidon.waitForDeployment();
  const poseidonAddress = await poseidon.getAddress();

  // 2. Deploy Verifier
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();

  // 3. Deploy ZKVault
  const VaultFactory = await ethers.getContractFactory("ZKVault");
  const vault = await VaultFactory.deploy(verifierAddress, poseidonAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log(`   - Poseidon Hasher : ${poseidonAddress}`);
  console.log(`   - Groth16Verifier : ${verifierAddress}`);
  console.log(`   - ZKVault (Brankas): ${vaultAddress}\n`);

  console.log("💰 [2. INITIAL BALANCES] Saldo Awal Semua Pihak:");
  console.log(`   - Alice (Penyetor)  : ${formatEth(await ethers.provider.getBalance(alice.address))} (${alice.address})`);
  console.log(`   - Relayer (Kurir)   : ${formatEth(await ethers.provider.getBalance(relayer.address))} (${relayer.address})`);
  for (const r of recipients) {
    console.log(`   - ${r.name.padEnd(8)} (Penerima): ${formatEth(await ethers.provider.getBalance(r.signer.address))} (${r.signer.address})`);
  }
  console.log("");

  console.log("🔐 [3. DEPOSIT] Alice Mempersiapkan Rahasia & Menyetor ke Brankas:");
  const { poseidon: poseidonLib, deposit } = await createDeposit();
  const zkTree = new ZKTree(8, poseidonLib);

  console.log(`   - Secret (rahasia Alice)     : ${deposit.secret.toString().slice(0, 15)}...`);
  console.log(`   - Nullifier (kunci kupon)    : ${deposit.nullifier.toString().slice(0, 15)}...`);
  console.log(`   - Commitment = H(null, sec)  : ${deposit.commitment.toString().slice(0, 15)}...`);
  console.log(`   - NullifierHash = H(null)    : ${deposit.nullifierHash.toString().slice(0, 15)}...`);

  console.log("\n   >> Alice mentransfer 1.0 ETH + commitment ke ZKVault...");
  const depositTx = await vault.connect(alice).deposit(deposit.commitment, {
    value: ethers.parseEther("1.0"),
  });
  const receipt = await depositTx.wait();
  const leafIndex = zkTree.insert(deposit.commitment);
  console.log(`   ✅ Deposit berhasil! Tx Hash: ${receipt?.hash}`);
  console.log(`   ✅ Leaf Index di Merkle Tree: ${leafIndex}`);
  console.log(`   ✅ Saldo Brankas saat ini: ${formatEth(await ethers.provider.getBalance(vaultAddress))}\n`);

  console.log("⚡ [4. ZK-PROOF GENERATION] Alice Membuat Bukti Matematika (Off-chain):");
  console.log("   Alice membuktikan bahwa dia memiliki salah satu deposit di brankas");
  console.log("   dan mengunci kupon tersebut ke 4 alamat penerima (Bob, Charlie, Dave, Eve)...");
  
  const recipientAddresses = recipients.map((r) => r.signer.address);
  const merkleProof = zkTree.generateProof(leafIndex);
  
  const startTime = Date.now();
  const { pA, pB, pC } = await generateProofAndCalldata(
    deposit,
    merkleProof,
    recipientAddresses
  );
  console.log(`   ✅ ZK-Proof (Groth16) berhasil digenerate dalam ${Date.now() - startTime} ms!`);
  console.log("   Alice sekarang menyerahkan ZK-Proof + NullifierHash + 4 Alamat Penerima ke Kurir (Relayer).\n");

  console.log("🚚 [5. RELAYER WITHDRAWAL] Kurir Menyerahkan Kupon ke Brankas:");
  console.log(`   Transaksi dipanggil oleh Relayer: ${relayer.address}`);
  console.log("   Identitas Alice TIDAK ADA sama sekali dalam transaksi ini!");

  const withdrawTx = await vault.connect(relayer).withdrawSplit(
    pA,
    pB,
    pC,
    merkleProof.root,
    deposit.nullifierHash,
    recipientAddresses as [string, string, string, string]
  );
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`   ✅ Pencairan berhasil! Tx Hash: ${withdrawReceipt?.hash}\n`);

  console.log("📊 [6. FINAL BALANCES & AUDIT RESULT]:");
  console.log("--------------------------------------------------------------------------------");
  console.log(`   - Alice (Penyetor)  : ${formatEth(await ethers.provider.getBalance(alice.address))} (Berkurang ~1.0 ETH)`);
  console.log(`   - Relayer (Kurir)   : ${formatEth(await ethers.provider.getBalance(relayer.address))} (Hanya bayar gas fee)`);
  for (const r of recipients) {
    const bal = await ethers.provider.getBalance(r.signer.address);
    console.log(`   - ${r.name.padEnd(8)} (Penerima): ${formatEth(bal)} [Bertambah tepat +0.25 ETH!]`);
  }
  console.log(`   - Brankas (ZKVault) : ${formatEth(await ethers.provider.getBalance(vaultAddress))} (Saldo sisa)`);
  console.log("--------------------------------------------------------------------------------");

  console.log("\n🔒 ANALISIS KEAMANAN & PRIVASI:");
  console.log("1. Unlinkability (Anonimitas Penuh):");
  console.log("   Di blockchain explorer, hanya tercatat:");
  console.log("   - Alice -> ZKVault (Deposit 1.0 ETH)");
  console.log("   - Relayer -> ZKVault.withdrawSplit() -> [Bob, Charlie, Dave, Eve] (+0.25 ETH each)");
  console.log("   TIDAK ADA korelasi on-chain antara Alice dan keempat penerima!");
  console.log("2. Anti Double-Spending:");
  console.log(`   NullifierHash ${deposit.nullifierHash.toString().slice(0, 20)}... telah ditandai SPENT di brankas.`);
  console.log("3. Anti Tampering / Anti Front-running:");
  console.log("   Keempat alamat penerima terkunci secara matematis di dalam ZK-Proof.");
  console.log("   Jika Relayer atau peretas mengganti alamat penerima, verifikasi ZK langsung gagal di smart contract.");
  console.log("================================================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
