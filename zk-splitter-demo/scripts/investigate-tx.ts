import path from "path";
import fs from "fs";
import { ethers } from "ethers";
import { ForensicInvestigator, ForensicReport } from "../src/forensic-engine";

// Helper color functions for clean terminal output
const C = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
};

async function main() {
  console.log(`\n${C.cyan}${C.bright}================================================================================${C.reset}`);
  console.log(`   🕵️‍♂️  ${C.white}${C.bright}ZK-VAULT FORENSIC AUDIT & DE-ANONYMIZATION INVESTIGATOR TOOL${C.reset}`);
  console.log(`   ${C.dim}Unit Forensik Siber & Anti-Money Laundering (AML) - Protocol Audit${C.reset}`);
  console.log(`${C.cyan}${C.bright}================================================================================${C.reset}\n`);

  // Load config & ABI
  const deployedPath = path.join(__dirname, "../deployed-contracts.json");
  if (!fs.existsSync(deployedPath)) {
    console.error(`${C.red}❌ Error: deployed-contracts.json tidak ditemukan! Silakan jalankan deploy terlebih dahulu.${C.reset}`);
    process.exit(1);
  }
  const deployedInfo = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));

  const vaultArtifactPath = path.join(__dirname, "../artifacts/contracts/ZKVault.sol/ZKVault.json");
  if (!fs.existsSync(vaultArtifactPath)) {
    console.error(`${C.red}❌ Error: Artifact ZKVault.json tidak ditemukan! Jalankan npx hardhat compile.${C.reset}`);
    process.exit(1);
  }
  const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf-8"));

  // Parse CLI args
  const args = process.argv.slice(2);
  let targetTxHash: string | undefined = undefined;
  let customRpc: string = deployedInfo.rpcUrl || "http://127.0.0.1:8545";
  let customVault: string = deployedInfo.vaultAddress;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tx" && args[i + 1]) {
      targetTxHash = args[i + 1];
      i++;
    } else if (args[i] === "--rpc" && args[i + 1]) {
      customRpc = args[i + 1];
      i++;
    } else if (args[i] === "--vault" && args[i + 1]) {
      customVault = args[i + 1];
      i++;
    } else if (args[i].startsWith("0x")) {
      targetTxHash = args[i];
    }
  }

  // Feature 1: --list or -l (Print all available withdraw transactions)
  if (args.includes("--list") || args.includes("-l")) {
    console.log(`📡 Mengambil riwayat transaksi penarikan dari smart contract...`);
    const provider = new ethers.JsonRpcProvider(customRpc);
    const vault = new ethers.Contract(customVault, vaultArtifact.abi, provider);
    const filter = vault.filters.WithdrawSplit();
    const currentBlock = await provider.getBlockNumber();
    const events = await vault.queryFilter(filter, 0, currentBlock);

    if (events.length === 0) {
      console.log(`${C.yellow}Belum ada transaksi WithdrawSplit di smart contract ini.${C.reset}\n`);
      process.exit(0);
    }

    console.log(`\n${C.bright}📋 DAFTAR TRANSAKSI PENARIKAN (WITHDRAWAL) TERSEDIA DI ON-CHAIN:${C.reset}`);
    console.log(`---------------------------------------------------------------------------------------------------------`);
    console.log(`  No  | Blok   | Total Nilai | Hash Transaksi                                                     | Waktu`);
    console.log(`---------------------------------------------------------------------------------------------------------`);

    const recent = events.slice(-15).reverse();
    for (let idx = 0; idx < recent.length; idx++) {
      const evt = recent[idx];
      const block = await provider.getBlock(evt.blockNumber);
      // @ts-ignore
      const totalWei = BigInt(evt.args[2].toString()) * 4n;
      const ethVal = ethers.formatEther(totalWei) + " ETH";
      const timeStr = block ? new Date(block.timestamp * 1000).toLocaleTimeString() : "";
      const isLatest = idx === 0 ? ` ${C.green}(Terbaru)${C.reset}` : "";
      console.log(`  #${(idx + 1).toString().padEnd(3)} | #${evt.blockNumber.toString().padEnd(6)} | ${C.green}${ethVal.padEnd(11)}${C.reset} | ${C.cyan}${evt.transactionHash}${C.reset} | ${timeStr}${isLatest}`);
    }
    console.log(`---------------------------------------------------------------------------------------------------------`);
    console.log(`👉 Untuk mengaudit salah satu transaksi di atas, jalankan:`);
    console.log(`   npx tsx scripts/investigate-tx.ts 1        (untuk audit transaksi #1 terbaru)`);
    console.log(`   npx tsx scripts/investigate-tx.ts <TxHash> (untuk audit tx hash spesifik)\n`);
    process.exit(0);
  }

  // Feature 2: Numeric Index selection (e.g. "1" or "2")
  if (!targetTxHash && args[0] && !isNaN(parseInt(args[0])) && !args[0].startsWith("0x")) {
    const targetIdx = parseInt(args[0]) - 1;
    const provider = new ethers.JsonRpcProvider(customRpc);
    const vault = new ethers.Contract(customVault, vaultArtifact.abi, provider);
    const filter = vault.filters.WithdrawSplit();
    const currentBlock = await provider.getBlockNumber();
    const events = await vault.queryFilter(filter, 0, currentBlock);
    const recent = events.slice(-15).reverse();
    if (targetIdx >= 0 && targetIdx < recent.length) {
      targetTxHash = recent[targetIdx].transactionHash;
      console.log(`🔍 Memilih transaksi nomor #${args[0]} dari riwayat on-chain: ${targetTxHash}`);
    } else {
      console.error(`${C.red}Nomor indeks transaksi #${args[0]} tidak valid! Hanya ada ${recent.length} transaksi.${C.reset}`);
      process.exit(1);
    }
  }

  console.log(`📡 Menghubungkan ke Node RPC : ${C.yellow}${customRpc}${C.reset}`);
  console.log(`🏛️  Alamat Kontrak ZKVault    : ${C.yellow}${customVault}${C.reset}`);
  if (targetTxHash) {
    console.log(`🎯 Target Transaksi Audit     : ${C.cyan}${targetTxHash}${C.reset}\n`);
  } else {
    console.log(`🔎 Target Transaksi           : ${C.magenta}Otomatis mendeteksi transaksi WithdrawSplit terbaru on-chain...${C.reset}\n`);
  }

  const investigator = new ForensicInvestigator(customRpc, customVault, vaultArtifact.abi);

  try {
    process.stdout.write(`⏳ Memulai pemindaian blok & rekonstruksi Merkle Tree... `);
    const report: ForensicReport = await investigator.investigateWithdrawTx(targetTxHash);
    console.log(`${C.green}SELESAI!${C.reset}\n`);

    // Print Investigation Summary
    console.log(`${C.bright}📋 HASIL REKONSTRUKSI BUKTI ON-CHAIN:${C.reset}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`  • ID Investigasi      : ${C.white}${report.investigationId}${C.reset}`);
    console.log(`  • Target Tx Hash      : ${C.cyan}${report.withdrawTxHash}${C.reset}`);
    console.log(`  • Blok Penarikan      : #${report.withdrawBlock}`);
    console.log(`  • Kurir (Relayer)     : ${report.relayerAddress}`);
    console.log(`  • Total Pencairan     : ${C.green}${report.totalWithdrawnEth} ETH${C.reset} (4 x ${report.amountPerRecipientEth} ETH)`);
    console.log(`  • Merkle Root Bukti   : ${report.merkleRootHex}`);
    console.log(`  • Nullifier Hash      : ${report.nullifierHashHex}`);
    console.log(`  • 4 Dompet Penerima   :`);
    report.recipients.forEach((r, idx) => {
      console.log(`     ${idx + 1}. ${r}`);
    });

    console.log(`\n${C.bright}🔍 ANALISIS ANONYMITY SET (PILAR 1 & 2):${C.reset}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`  • Ukuran Anonymity Set (k) : ${report.anonymitySetSize === 1 ? C.bgRed + " k = 1 (ANONYMITY COLLAPSE!) " + C.reset : C.yellow + `k = ${report.anonymitySetSize} kandidat` + C.reset}`);
    console.log(`  • Total Setoran Valid      : ${report.candidates.length} deposit sebelum/saat Merkle Root terbentuk.`);

    console.log(`\n${C.bright}📊 MATRIKS SKOR KANDIDAT PENYETOR (PILAR 3, 4, & 5):${C.reset}`);
    console.log(`--------------------------------------------------------------------------------`);

    report.candidates.forEach((cand, index) => {
      let badge = "";
      if (cand.confidence === "HIGH") {
        badge = `${C.bgRed}${C.white}${C.bright} 🔴 HIGH (${cand.score}%) ${C.reset}`;
      } else if (cand.confidence === "MEDIUM") {
        badge = `${C.bgYellow}${C.white}${C.bright} 🟡 MEDIUM (${cand.score}%) ${C.reset}`;
      } else {
        badge = `${C.dim} ⚪ LOW (${cand.score}%) ${C.reset}`;
      }

      console.log(`\n  [#${index + 1}] Alamat: ${C.cyan}${cand.depositorAddress}${C.reset}  ${badge}`);
      console.log(`      • Tx Setoran   : ${cand.depositTxHash} (Blok #${cand.depositBlock})`);
      console.log(`      • Nominal      : ${cand.depositAmountEth} ETH`);
      console.log(`      • Selisih Waktu: ${cand.timeDeltaMinutes} menit sebelum penarikan`);
      console.log(`      • Temuan Forensik:`);
      cand.findings.forEach((f) => {
        console.log(`         ${f}`);
      });
    });

    console.log(`\n${C.bright}🏁 KESIMPULAN PENYELIDIKAN (EXECUTIVE SUMMARY):${C.reset}`);
    console.log(`--------------------------------------------------------------------------------`);
    if (report.primeSuspect && report.primeSuspect.confidence === "HIGH") {
      console.log(`${C.red}${C.bright}🚨 TERSANGKA UTAMA TERIDENTIFIKASI SECARA PASTI:${C.reset}`);
      console.log(`   Alamat Penyetor : ${C.yellow}${C.bright}${report.primeSuspect.depositorAddress}${C.reset}`);
      console.log(`   Tingkat Akurasi : ${C.green}${C.bright}${report.primeSuspect.score}% (HIGH CONFIDENCE)${C.reset}`);
      console.log(`   Rekomendasi     : Segera layangkan surat panggilan forensik / subpoena CEX KYC untuk dompet ini.`);
    } else if (report.primeSuspect && report.primeSuspect.confidence === "MEDIUM") {
      console.log(`${C.yellow}${C.bright}⚠️  KANDIDAT KUAT BERINDIKASI TINGGI:${C.reset}`);
      console.log(`   Alamat Penyetor : ${C.yellow}${report.primeSuspect.depositorAddress}${C.reset}`);
      console.log(`   Tingkat Akurasi : ${report.primeSuspect.score}% (MEDIUM CONFIDENCE)`);
    } else {
      console.log(`${C.white}⚪ Hasil belum konklusif. Tidak ada tersangka tunggal yang mendominasi.${C.reset}`);
    }
    console.log(`--------------------------------------------------------------------------------\n`);

    // Save Markdown report to disk
    const reportsDir = path.join(__dirname, "../audit-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportFilePath = path.join(reportsDir, `forensic-report-${report.withdrawTxHash.slice(0, 10)}.md`);

    const mdContent = `# 🛡️ LAPORAN AUDIT FORENSIK DIGITAL BLOCKCHAIN
**Nomor Berkas:** ${report.investigationId}
**Waktu Audit:** ${report.timestamp}
**Target Tx:** \`${report.withdrawTxHash}\`
**Status Keyakinan:** ${report.primeSuspect ? report.primeSuspect.confidence : "LOW"}

---

## 📌 Ringkasan Eksekutif
${report.executiveSummary}

---

## 📋 Data Transaksi Pencairan (Target)
- **Brankas (ZKVault):** \`${report.vaultAddress}\`
- **Kurir (Relayer):** \`${report.relayerAddress}\`
- **Total Dana Keluar:** ${report.totalWithdrawnEth} ETH (dipecah rata ke 4 penerima @ ${report.amountPerRecipientEth} ETH)
- **Merkle Root Publik:** \`${report.merkleRootHex}\`
- **Nullifier Hash Terpakai:** \`${report.nullifierHashHex}\`
- **4 Dompet Penerima:**
${report.recipients.map((r, i) => `  ${i + 1}. \`${r}\``).join("\n")}

---

## 🔍 Analisis Anonymity Set & Pohon Merkle (Pilar 1)
- **Ukuran Anonymity Set ($k$):** **${report.anonymitySetSize}**
- **Interpretasi Forensik:**
${
  report.anonymitySetSize === 1
    ? "> ⚠️ **ANONYMITY COLLAPSE:** Hanya ada 1 transaksi setoran yang valid sebelum root ini diterbitkan. Berdasarkan hukum kriptografi pohon Merkle, penarik HANYA BISA berasal dari setoran tunggal ini."
    : `> Terdapat ${report.anonymitySetSize} setoran yang bersaing di dalam pohon Merkle pada saat penarikan.`
}

---

## 📊 Matriks Kandidat Tersangka
| No | Alamat Penyetor | Blok Deposit | Nominal | Jeda Waktu | Skor Keyakinan | Status |
|:---|:---|:---|:---|:---|:---|:---|
${report.candidates
  .map(
    (c, idx) =>
      `| ${idx + 1} | \`${c.depositorAddress}\` | #${c.depositBlock} | ${c.depositAmountEth} ETH | ${c.timeDeltaMinutes} mnt | **${c.score}%** | **${c.confidence}** |`
  )
  .join("\n")}

### Temuan Forensik per Kandidat:
${report.candidates
  .map(
    (c, idx) => `
#### Kandidat #${idx + 1}: \`${c.depositorAddress}\` (Skor: ${c.score}%)
- **Hash Transaksi Setoran:** \`${c.depositTxHash}\`
- **Detail Analisis:**
${c.findings.map((f) => `  - ${f}`).join("\n")}
`
  )
  .join("\n")}

---

## ⚖️ Rekomendasi Tindak Lanjut Hukum & Forensik
1. **Penerbitan Surat Perintah CEX:** Mengajukan penelusuran KYC ke bursa kripto tempat penyetor \`${report.primeSuspect?.depositorAddress}\` melakukan pendanaan awal (*source of funds*).
2. **Pemantauan Dompet Penerima:** Memasang *alert* on-chain terhadap 4 dompet penerima untuk mendeteksi *sweeping* dana ke alamat konsolidasi.

---
*Laporan ini dihasilkan secara otomatis oleh Mesin Audit Forensik ZK-Vault Splitter.*
`;

    fs.writeFileSync(reportFilePath, mdContent);
    console.log(`💾 ${C.green}Laporan Bukti Forensik berhasil disimpan di:${C.reset}`);
    console.log(`   ${C.white}${reportFilePath}${C.reset}\n`);
  } catch (err: any) {
    console.error(`\n${C.red}❌ Terjadi kesalahan selama investigasi: ${err.message}${C.reset}\n`);
    process.exit(1);
  }
}

main().catch(console.error);
