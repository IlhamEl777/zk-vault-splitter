import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { ethers } from "ethers";
// @ts-ignore
import { buildPoseidon } from "circomlibjs";
import { ZKTree, createDeposit, generateProofAndCalldata } from "./src/zk-utils";
import { ForensicInvestigator } from "./src/forensic-engine";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const RPC_URL = "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Load deployment config
const deployedPath = path.join(__dirname, "deployed-contracts.json");
if (!fs.existsSync(deployedPath)) {
  console.error("deployed-contracts.json not found! Please run deploy script first.");
  process.exit(1);
}
const deployedInfo = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));

// Load ZKVault ABI
const vaultArtifactPath = path.join(__dirname, "artifacts/contracts/ZKVault.sol/ZKVault.json");
const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf-8"));
const vaultAbi = vaultArtifact.abi;

const ACCOUNT_MAP: Record<string, { name: string; index: number; address: string }> = {
  alice: { name: "Alice", index: 1, address: deployedInfo.accounts.alice },
  bob: { name: "Bob", index: 2, address: deployedInfo.accounts.bob },
  charlie: { name: "Charlie", index: 3, address: deployedInfo.accounts.charlie },
  dave: { name: "Dave", index: 4, address: deployedInfo.accounts.dave },
  eve: { name: "Eve", index: 5, address: deployedInfo.accounts.eve },
};

let activeConfig = {
  depositor: "alice",
  recipients: ["bob", "charlie", "dave", "eve"],
  denominationEth: "1.0",
};

let poseidonInstance: any = null;
let zkTree: ZKTree | null = null;
let currentDeposit: any = null;
let currentMerkleProof: any = null;
let currentProofData: any = null;
let lastSpentNullifierHash: string | null = null;
let lastDepositTxHash: string | null = null;

async function syncTree() {
  if (!zkTree || !poseidonInstance) {
    zkTree = new ZKTree(8, poseidonInstance);
  }
  const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, provider);
  const filter = vault.filters.Deposit();
  const events = await vault.queryFilter(filter, 0, "latest");

  zkTree = new ZKTree(8, poseidonInstance);
  for (const evt of events) {
    // @ts-ignore
    const commitment = BigInt(evt.args[0].toString());
    zkTree.insert(commitment);
  }
  console.log(`🌲 Merkle Tree synced with on-chain events: ${events.length} leaves, root: 0x${zkTree.getRoot().toString(16)}`);
}

async function initZK() {
  const poseidon = await buildPoseidon();
  poseidonInstance = poseidon;
  zkTree = new ZKTree(8, poseidon);
  await syncTree();
  console.log("⚡ Poseidon & ZKTree(depth 8) initialized");
}

function formatEth(wei: bigint): string {
  return parseFloat(ethers.formatEther(wei)).toFixed(4) + " ETH";
}

// 0. POST /api/config - Set dynamic Depositor, Recipients, and Denomination
app.post("/api/config", async (req, res) => {
  try {
    const { depositor, recipients, denominationEth } = req.body;

    if (depositor && ACCOUNT_MAP[depositor.toLowerCase()]) {
      activeConfig.depositor = depositor.toLowerCase();
    }

    if (recipients && Array.isArray(recipients) && recipients.length === 4) {
      activeConfig.recipients = recipients.map((r: string) => r.toLowerCase());
    } else if (depositor) {
      // Auto-assign remaining 4 accounts
      activeConfig.recipients = Object.keys(ACCOUNT_MAP).filter(
        (k) => k !== activeConfig.depositor
      );
    }

    if (denominationEth !== undefined) {
      const parsed = parseFloat(denominationEth.toString());
      if (parsed >= 0.04) {
        activeConfig.denominationEth = parsed.toFixed(2);
        // Call contract to update denomination
        const deployerSigner = await provider.getSigner(0);
        const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, deployerSigner);
        const tx = await vault.setDenomination(ethers.parseEther(activeConfig.denominationEth));
        await tx.wait();
        console.log(`[EVM LIVE] Vault denomination updated to ${activeConfig.denominationEth} ETH`);
      }
    }

    const splitEth = (parseFloat(activeConfig.denominationEth) / 4).toFixed(4);

    res.json({
      success: true,
      config: activeConfig,
      splitAmountEth: splitEth,
    });
  } catch (err: any) {
    console.error("Config update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. GET /api/status - Live Blockchain State from Hardhat Node
app.get("/api/status", async (req, res) => {
  try {
    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();

    const vaultAddr = deployedInfo.vaultAddress;
    const relayerAddr = deployedInfo.accounts.relayer;

    const accountKeys = ["alice", "bob", "charlie", "dave", "eve"];
    const accountBalances: Record<string, string> = {};

    for (const key of accountKeys) {
      const bal = await provider.getBalance(ACCOUNT_MAP[key].address);
      accountBalances[key] = formatEth(bal);
    }

    const [vaultBal, relayerBal] = await Promise.all([
      provider.getBalance(vaultAddr),
      provider.getBalance(relayerAddr),
    ]);

    const depositorKey = activeConfig.depositor;
    const depositorInfo = {
      key: depositorKey,
      name: ACCOUNT_MAP[depositorKey].name,
      address: ACCOUNT_MAP[depositorKey].address,
      balance: accountBalances[depositorKey],
    };

    const recipientList = activeConfig.recipients.map((k) => ({
      key: k,
      name: ACCOUNT_MAP[k]?.name || k,
      address: ACCOUNT_MAP[k]?.address || k,
      balance: accountBalances[k] || "0 ETH",
    }));

    const splitEth = (parseFloat(activeConfig.denominationEth) / 4).toFixed(4);

    res.json({
      connected: true,
      network: "Hardhat Local EVM",
      rpcUrl: RPC_URL,
      chainId: deployedInfo.chainId,
      blockNumber,
      gasPriceGwei: feeData.gasPrice ? (Number(feeData.gasPrice) / 1e9).toFixed(2) : "0",
      vaultAddress: vaultAddr,
      activeConfig: {
        depositor: depositorInfo,
        recipients: recipientList,
        denominationEth: activeConfig.denominationEth,
        splitAmountEth: splitEth,
      },
      allAccounts: accountKeys.map((k) => ({
        key: k,
        name: ACCOUNT_MAP[k].name,
        address: ACCOUNT_MAP[k].address,
        balance: accountBalances[k],
        role: k === depositorKey ? "Depositor" : "Receiver",
      })),
      balances: {
        depositor: accountBalances[depositorKey],
        vault: formatEth(vaultBal),
        relayer: formatEth(relayerBal),
        alice: accountBalances["alice"],
        bob: accountBalances["bob"],
        charlie: accountBalances["charlie"],
        dave: accountBalances["dave"],
        eve: accountBalances["eve"],
        recipients: recipientList,
      },
      treeLeafCount: zkTree ? zkTree.leaves.length : 0,
      currentRoot: zkTree ? "0x" + zkTree.getRoot().toString(16) : null,
    });
  } catch (err: any) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// 2. POST /api/deposit - Dynamic On-Chain Deposit
app.post("/api/deposit", async (req, res) => {
  try {
    const depositorKey = activeConfig.depositor;
    const signerIndex = ACCOUNT_MAP[depositorKey].index;
    const depositorSigner = await provider.getSigner(signerIndex);
    const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, depositorSigner);

    // Create unique deposit preimage
    const { deposit } = await createDeposit();
    currentDeposit = deposit;

    console.log(
      `[EVM LIVE] ${ACCOUNT_MAP[depositorKey].name} (${depositorSigner.address}) menyetor ${activeConfig.denominationEth} ETH. Commitment: 0x${deposit.commitment.toString(16)}`
    );

    const tx = await vault.deposit(deposit.commitment, {
      value: ethers.parseEther(activeConfig.denominationEth),
    });
    const receipt = await tx.wait();
    lastDepositTxHash = receipt.hash;

    await syncTree();
    const leafIndex = zkTree!.leaves.length - 1;
    const merkleProof = zkTree!.generateProof(leafIndex);
    currentMerkleProof = merkleProof;

    const depositorBal = await provider.getBalance(depositorSigner.address);
    const vaultBal = await provider.getBalance(deployedInfo.vaultAddress);

    res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      depositor: {
        name: ACCOUNT_MAP[depositorKey].name,
        address: depositorSigner.address,
        balance: formatEth(depositorBal),
      },
      deposit: {
        secretHex: "0x" + deposit.secret.toString(16),
        nullifierHex: "0x" + deposit.nullifier.toString(16),
        commitmentHex: "0x" + deposit.commitment.toString(16),
        nullifierHashHex: "0x" + deposit.nullifierHash.toString(16),
        amountEth: activeConfig.denominationEth,
      },
      leafIndex,
      merkleRootHex: "0x" + merkleProof.root.toString(16),
      balances: {
        depositor: formatEth(depositorBal),
        vault: formatEth(vaultBal),
      },
    });
  } catch (err: any) {
    console.error("Deposit error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST /api/prove - Real Off-Chain Groth16 Proving with SnarkJS
app.post("/api/prove", async (req, res) => {
  try {
    if (!currentDeposit || !currentMerkleProof) {
      return res.status(400).json({ error: "Lakukan deposit terlebih dahulu!" });
    }

    const recipients = activeConfig.recipients.map((k) => ACCOUNT_MAP[k]?.address || k);

    const wasmPath = path.join(__dirname, "build/splitter_js/splitter.wasm");
    const zkeyPath = path.join(__dirname, "build/splitter_final.zkey");

    console.log(`[EVM LIVE] Menghitung bukti Groth16 untuk 4 penerima [${activeConfig.recipients.join(", ")}]...`);
    const startTime = Date.now();

    const proofData = await generateProofAndCalldata(
      currentDeposit,
      currentMerkleProof,
      recipients,
      wasmPath,
      zkeyPath
    );

    const provingTimeMs = Date.now() - startTime;
    currentProofData = proofData;

    console.log(`[EVM LIVE] Bukti ZK berhasil dihitung dalam ${provingTimeMs} ms!`);

    res.json({
      success: true,
      provingTimeMs,
      proof: {
        pA: proofData.pA,
        pB: proofData.pB,
        pC: proofData.pC,
      },
      recipients: activeConfig.recipients.map((k) => ({
        name: ACCOUNT_MAP[k].name,
        address: ACCOUNT_MAP[k].address,
      })),
      publicSignals: proofData.pubSignals,
      nullifierHash: "0x" + currentDeposit.nullifierHash.toString(16),
      merkleRoot: "0x" + currentMerkleProof.root.toString(16),
    });
  } catch (err: any) {
    console.error("Prove error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /api/withdraw - Dynamic Relayer Withdrawal & Split On-Chain
app.post("/api/withdraw", async (req, res) => {
  try {
    if (!currentProofData) {
      return res.status(400).json({ error: "Hitung bukti ZK terlebih dahulu!" });
    }

    const relayerSigner = await provider.getSigner(6);
    const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, relayerSigner);

    const recipients = activeConfig.recipients.map((k) => ACCOUNT_MAP[k]?.address || k);

    console.log(`[EVM LIVE] Kurir Relayer (${relayerSigner.address}) mengirim tx withdrawSplit ke 4 penerima...`);

    const tx = await vault.withdrawSplit(
      currentProofData.pA,
      currentProofData.pB,
      currentProofData.pC,
      currentMerkleProof.root,
      currentDeposit.nullifierHash,
      recipients
    );
    const receipt = await tx.wait();

    lastSpentNullifierHash = "0x" + currentDeposit.nullifierHash.toString(16);

    const recipientBals = await Promise.all(recipients.map((r) => provider.getBalance(r)));
    const [vaultBal, relayerBal] = await Promise.all([
      provider.getBalance(deployedInfo.vaultAddress),
      provider.getBalance(relayerSigner.address),
    ]);

    const splitEth = (parseFloat(activeConfig.denominationEth) / 4).toFixed(4);
    const recipientResults = activeConfig.recipients.map((k, i) => ({
      key: k,
      name: ACCOUNT_MAP[k].name,
      address: recipients[i],
      balance: formatEth(recipientBals[i]),
      receivedEth: splitEth,
    }));

    res.json({
      success: true,
      txHash: receipt.hash,
      depositTxHash: lastDepositTxHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      nullifierSpent: lastSpentNullifierHash,
      splitAmountPerRecipient: `${splitEth} ETH`,
      recipients: recipientResults,
      balances: {
        vault: formatEth(vaultBal),
        relayer: formatEth(relayerBal),
      },
    });
  } catch (err: any) {
    console.error("Withdraw error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST /api/attack/hijack - Real Front-Running Revert Interception
app.post("/api/attack/hijack", async (req, res) => {
  try {
    if (!currentProofData) {
      return res.status(400).json({ error: "Lakukan deposit & prove terlebih dahulu!" });
    }

    const rogueRelayer = await provider.getSigner(6);
    const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, rogueRelayer);

    // Rogue relayer tries to replace recipient 0 with hacker address
    const hijackedRecipients = [
      "0x000000000000000000000000000000000000bEEF", // Hacker
      ACCOUNT_MAP[activeConfig.recipients[1]].address,
      ACCOUNT_MAP[activeConfig.recipients[2]].address,
      ACCOUNT_MAP[activeConfig.recipients[3]].address,
    ];

    console.log("[EVM LIVE ATTACK] Kurir nakal mencoba mengubah alamat penerima...");

    await vault.withdrawSplit(
      currentProofData.pA,
      currentProofData.pB,
      currentProofData.pC,
      currentMerkleProof.root,
      currentDeposit.nullifierHash,
      hijackedRecipients
    );

    // If it didn't revert, something went wrong
    res.status(400).json({ success: false, message: "Serangan seharusnya gagal tetapi tidak revert!" });
  } catch (err: any) {
    const errorMsg = err.reason || err.shortMessage || err.message;
    console.log(`[EVM LIVE ATTACK INTERCEPTED] Smart contract menolak: ${errorMsg}`);
    res.json({
      reverted: true,
      reason: errorMsg,
      defenseTitle: "Sabotase Alamat Berhasil Dicegat On-Chain!",
      defenseDesc:
        "Smart contract menolak transaksi karena bukti Groth16 terkunci rapat pada 4 alamat penerima asli. Manipulasi 1 digit saja membuat verifikasi matematika gagal.",
    });
  }
});

// 6. POST /api/attack/doublespend - Real Double-Spend Revert Interception
app.post("/api/attack/doublespend", async (req, res) => {
  try {
    if (!currentProofData || !lastSpentNullifierHash) {
      return res.status(400).json({ error: "Harus menyelesaikan pencairan normal putaran 1 terlebih dahulu!" });
    }

    const relayerSigner = await provider.getSigner(6);
    const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, relayerSigner);

    const recipients = activeConfig.recipients.map((k) => ACCOUNT_MAP[k]?.address || k);

    console.log(
      `[EVM LIVE ATTACK] Mencoba menggunakan kupon nullifier yang sama kedua kalinya: ${lastSpentNullifierHash}...`
    );

    await vault.withdrawSplit(
      currentProofData.pA,
      currentProofData.pB,
      currentProofData.pC,
      currentMerkleProof.root,
      currentDeposit.nullifierHash,
      recipients
    );

    res.status(400).json({ success: false, message: "Seharusnya gagal tetapi tidak revert!" });
  } catch (err: any) {
    const errorMsg = err.reason || err.shortMessage || err.message;
    console.log(`[EVM LIVE ATTACK INTERCEPTED] Smart contract menolak: ${errorMsg}`);
    res.json({
      reverted: true,
      reason: errorMsg,
      defenseTitle: "Double-Spending Ditolak Smart Contract!",
      defenseDesc: `NullifierHash ${lastSpentNullifierHash} telah tercatat sebagai SPENT di smart contract ZKVault. Pencairan kedua langsung ditolak on-chain.`,
    });
  }
});

// 7. ALL /api/investigate - Automated Forensic Audit Investigation
app.all("/api/investigate", async (req, res) => {
  try {
    const txHash = req.body?.txHash || (req.query?.txHash as string) || undefined;
    console.log(`[EVM LIVE FORENSIC] Memulai audit forensik ${txHash ? `untuk tx: ${txHash}` : "untuk transaksi pencairan terbaru"}...`);
    const investigator = new ForensicInvestigator(RPC_URL, deployedInfo.vaultAddress, vaultAbi);
    const report = await investigator.investigateWithdrawTx(txHash);
    res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error("Forensic investigation error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. GET /api/withdraw-history - Recent On-Chain Withdrawals
app.get("/api/withdraw-history", async (req, res) => {
  try {
    const vault = new ethers.Contract(deployedInfo.vaultAddress, vaultAbi, provider);
    const filter = vault.filters.WithdrawSplit();
    const currentBlock = await provider.getBlockNumber();
    const events = await vault.queryFilter(filter, 0, currentBlock);

    // Process latest 15 events in reverse chronological order
    const recentEvents = events.slice(-15).reverse();
    const history = await Promise.all(
      recentEvents.map(async (evt, index) => {
        const block = await provider.getBlock(evt.blockNumber);
        // @ts-ignore
        const nullifierHash = "0x" + BigInt(evt.args[0].toString()).toString(16);
        // @ts-ignore
        const recipients = (evt.args[1] as string[]).map((r) => r.toLowerCase());
        // @ts-ignore
        const payoutPerRecWei = BigInt(evt.args[2].toString());
        const totalWei = payoutPerRecWei * 4n;
        // @ts-ignore
        const relayer = evt.args[3].toLowerCase();

        return {
          id: events.length - index,
          txHash: evt.transactionHash,
          blockNumber: evt.blockNumber,
          timestamp: block ? block.timestamp : 0,
          timeString: block ? new Date(block.timestamp * 1000).toLocaleTimeString() : "",
          amountPerRecipientEth: ethers.formatEther(payoutPerRecWei),
          totalWithdrawnEth: ethers.formatEther(totalWei),
          relayer,
          recipients,
          nullifierHash,
        };
      })
    );

    res.json({
      success: true,
      totalCount: events.length,
      history,
    });
  } catch (err: any) {
    console.error("Error fetching withdraw history:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

initZK().then(() => {
  app.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(`  🌐 LIVE BLOCKCHAIN API BRIDGE RUNNING ON http://127.0.0.1:${PORT}`);
    console.log(`  🔗 Connected to Hardhat EVM Node on ${RPC_URL}`);
    console.log(`  🏛️ ZKVault Contract: ${deployedInfo.vaultAddress}`);
    console.log(`============================================================\n`);
  });
});
