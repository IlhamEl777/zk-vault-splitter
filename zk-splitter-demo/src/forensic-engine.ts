import { ethers } from "ethers";
// @ts-ignore
import { buildPoseidon } from "circomlibjs";
import { ZKTree } from "./zk-utils";
import fs from "fs";
import path from "path";

export interface CandidateAnalysis {
  candidateIndex: number;
  leafIndex: number;
  depositorAddress: string;
  depositTxHash: string;
  depositBlock: number;
  depositTimestamp: number;
  depositAmountEth: string;
  commitmentHex: string;
  timeDeltaMinutes: number;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  findings: string[];
}

export interface ForensicReport {
  investigationId: string;
  timestamp: string;
  withdrawTxHash: string;
  withdrawBlock: number;
  vaultAddress: string;
  relayerAddress: string;
  recipients: string[];
  amountPerRecipientEth: string;
  totalWithdrawnEth: string;
  merkleRootHex: string;
  nullifierHashHex: string;
  anonymitySetSize: number;
  primeSuspect: CandidateAnalysis | null;
  candidates: CandidateAnalysis[];
  executiveSummary: string;
}

export class ForensicInvestigator {
  provider: ethers.JsonRpcProvider;
  vaultAddress: string;
  vaultAbi: any;
  poseidon: any = null;

  constructor(rpcUrl: string, vaultAddress: string, vaultAbi: any) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.vaultAddress = vaultAddress;
    this.vaultAbi = vaultAbi;
  }

  async init() {
    if (!this.poseidon) {
      this.poseidon = await buildPoseidon();
    }
  }

  /**
   * Run full forensic audit on a withdrawal transaction
   */
  async investigateWithdrawTx(withdrawTxHash?: string): Promise<ForensicReport> {
    await this.init();
    const vault = new ethers.Contract(this.vaultAddress, this.vaultAbi, this.provider);

    let targetTxHash = withdrawTxHash;
    let targetReceipt: ethers.TransactionReceipt | null = null;

    if (!targetTxHash) {
      // Find latest WithdrawSplit or ScheduledSplitCreated event
      const withdrawFilter = vault.filters.WithdrawSplit();
      const scheduledFilter = vault.filters.ScheduledSplitCreated();
      const currentBlock = await this.provider.getBlockNumber();
      const [eventsEqual, eventsStealth] = await Promise.all([
        vault.queryFilter(withdrawFilter, 0, currentBlock),
        vault.queryFilter(scheduledFilter, 0, currentBlock),
      ]);
      const allWithdrawEvents = [...eventsEqual, ...eventsStealth].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        return a.index - b.index;
      });
      if (allWithdrawEvents.length === 0) {
        throw new Error("Belum ada transaksi pencairan (WithdrawSplit / ScheduledSplit) yang ditemukan di smart contract!");
      }
      const latestEvent = allWithdrawEvents[allWithdrawEvents.length - 1];
      targetTxHash = latestEvent.transactionHash;
      targetReceipt = await this.provider.getTransactionReceipt(targetTxHash);
    } else {
      targetReceipt = await this.provider.getTransactionReceipt(targetTxHash);
    }

    if (!targetReceipt) {
      throw new Error(`Receipt untuk transaksi ${targetTxHash} tidak ditemukan.`);
    }

    let tx = await this.provider.getTransaction(targetTxHash);
    if (!tx) {
      throw new Error(`Transaksi ${targetTxHash} tidak ditemukan di blockchain.`);
    }

    // Check if this transaction is a ScheduledPayoutDispatched (keeper slot execution)
    // If so, redirect investigation to the parent batch creation transaction
    for (const log of targetReceipt.logs) {
      try {
        const parsed = vault.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "ScheduledPayoutDispatched") {
          const hasCreation = targetReceipt.logs.some((l) => {
            try {
              const p = vault.interface.parseLog({ topics: l.topics as string[], data: l.data });
              return p && p.name === "ScheduledSplitCreated";
            } catch {
              return false;
            }
          });
          if (!hasCreation) {
            // It's a secondary execution tx. Find the creation tx by batchId.
            const batchId = parsed.args.batchId;
            const parentFilter = vault.filters.ScheduledSplitCreated(batchId);
            const parentEvents = await vault.queryFilter(parentFilter, 0, targetReceipt.blockNumber);
            if (parentEvents.length > 0) {
              targetTxHash = parentEvents[0].transactionHash;
              const parentReceipt = await this.provider.getTransactionReceipt(targetTxHash);
              const parentTx = await this.provider.getTransaction(targetTxHash);
              if (parentReceipt && parentTx) {
                targetReceipt = parentReceipt;
                tx = parentTx;
              }
            }
          }
          break;
        }
      } catch {
        // Not a vault log
      }
    }

    // Decode WithdrawSplit or ScheduledSplitCreated event
    let withdrawEvent: any = null;
    let splitMode: "equal" | "stealth" = "equal";

    for (const log of targetReceipt.logs) {
      try {
        const parsed = vault.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && (parsed.name === "WithdrawSplit" || parsed.name === "ScheduledSplitCreated")) {
          withdrawEvent = parsed;
          splitMode = parsed.name === "ScheduledSplitCreated" ? "stealth" : "equal";
          break;
        }
      } catch (e) {
        // Not a vault log
      }
    }

    if (!withdrawEvent) {
      throw new Error("Transaksi tersebut bukan merupakan pemanggilan withdrawSplit atau withdrawScheduledSplit yang valid!");
    }

    let rootBigInt = 0n;
    let merkleRootHex = "";
    let nullifierHashHex = "";
    let recipients: string[] = [];
    let amountPerRecipientEth = "0";
    let totalWithdrawnEth = "0";
    let relayerAddress = "";

    if (splitMode === "stealth") {
      const decodedCalldata = vault.interface.decodeFunctionData("withdrawScheduledSplit", tx.data);
      rootBigInt = BigInt(decodedCalldata._root.toString());
      merkleRootHex = "0x" + rootBigInt.toString(16);

      const nullifierHashBigInt = BigInt(withdrawEvent.args.nullifierHash.toString());
      nullifierHashHex = "0x" + nullifierHashBigInt.toString(16);

      recipients = (withdrawEvent.args.recipients as string[]).map((r) => r.toLowerCase());
      const rawAmounts = withdrawEvent.args.amounts as any[];
      const amountsWei = rawAmounts.map((a) => BigInt(a.toString()));
      const totalWei = amountsWei.reduce((sum, a) => sum + a, 0n);
      totalWithdrawnEth = ethers.formatEther(totalWei);
      amountPerRecipientEth = (parseFloat(totalWithdrawnEth) / 4).toFixed(4);
      relayerAddress = withdrawEvent.args.relayer.toLowerCase();
    } else {
      const decodedCalldata = vault.interface.decodeFunctionData("withdrawSplit", tx.data);
      rootBigInt = BigInt(decodedCalldata._root.toString());
      merkleRootHex = "0x" + rootBigInt.toString(16);

      const nullifierHashBigInt = BigInt(withdrawEvent.args.nullifierHash.toString());
      nullifierHashHex = "0x" + nullifierHashBigInt.toString(16);

      recipients = (withdrawEvent.args.recipients as string[]).map((r) => r.toLowerCase());
      const amountPerRecipient = BigInt(withdrawEvent.args.amountPerRecipient.toString());
      amountPerRecipientEth = ethers.formatEther(amountPerRecipient);
      totalWithdrawnEth = ethers.formatEther(amountPerRecipient * 4n);
      relayerAddress = withdrawEvent.args.relayer.toLowerCase();
    }

    const withdrawBlockData = await this.provider.getBlock(targetReceipt.blockNumber);
    const withdrawTimestamp = withdrawBlockData ? withdrawBlockData.timestamp : Math.floor(Date.now() / 1000);

    // Scan all Deposit events up to withdraw block
    const depositFilter = vault.filters.Deposit();
    const depositEvents = await vault.queryFilter(depositFilter, 0, targetReceipt.blockNumber);

    // Reconstruct Merkle Tree to find Anonymity Set at the moment this root was formed
    const zkTree = new ZKTree(8, this.poseidon);
    const candidateDeposits: any[] = [];

    for (let i = 0; i < depositEvents.length; i++) {
      const depEvt = depositEvents[i];
      // @ts-ignore
      const commitment = BigInt(depEvt.args[0].toString());
      zkTree.insert(commitment);

      const currentRoot = zkTree.getRoot();
      const depTx = await this.provider.getTransaction(depEvt.transactionHash);
      const depBlock = await this.provider.getBlock(depEvt.blockNumber);

      candidateDeposits.push({
        leafIndex: i,
        commitment,
        commitmentHex: "0x" + commitment.toString(16),
        txHash: depEvt.transactionHash,
        depositor: depTx ? depTx.from.toLowerCase() : "unknown",
        blockNumber: depEvt.blockNumber,
        timestamp: depBlock ? depBlock.timestamp : 0,
        valueWei: depTx ? depTx.value : 0n,
        treeRootAtDeposit: "0x" + currentRoot.toString(16),
      });

      // If the tree matches the root used in withdrawal
      if (currentRoot === rootBigInt) {
        // We found the exact state that minted this root!
        break;
      }
    }

    const anonymitySetSize = candidateDeposits.length;
    const candidates: CandidateAnalysis[] = [];

    // Count how many candidates match the withdrawal total amount
    const matchingDenomCandidates = candidateDeposits.filter((c) => {
      const depEth = ethers.formatEther(c.valueWei);
      return parseFloat(depEth).toFixed(4) === parseFloat(totalWithdrawnEth).toFixed(4);
    });
    const denomAnonymitySize = matchingDenomCandidates.length;
    const blockCache = new Map<number, any>();

    // Evaluate each candidate in the anonymity set
    for (let i = 0; i < candidateDeposits.length; i++) {
      const cand = candidateDeposits[i];
      let score = 0;
      const findings: string[] = [];
      const depEth = ethers.formatEther(cand.valueWei);
      const isDenomMatch = parseFloat(depEth).toFixed(4) === parseFloat(totalWithdrawnEth).toFixed(4);

      // 1. Pilar 1 & 2: Anonymity Set & Denomination Collapse
      if (denomAnonymitySize === 1 && isDenomMatch) {
        score += 65;
        findings.push(`🔴 [Denomination Collapse] Setoran ini adalah SATU-SATUNYA setoran dengan nominal persis ${depEth} ETH di seluruh pohon Merkle (k_denom = 1)!`);
      } else if (anonymitySetSize === 1) {
        score += 60;
        findings.push("🔴 [Anonymity Collapse] Setoran ini adalah SATU-SATUNYA daun sebelum Merkle Root diterbitkan (k=1).");
      } else if (isDenomMatch) {
        score += 25;
        findings.push(`✅ [Denominasi Cocok] Nilai setoran (${depEth} ETH) persis sama dengan total pencairan (${totalWithdrawnEth} ETH) di antara ${denomAnonymitySize} kandidat sejenis.`);
      } else {
        findings.push(`⚪ [Denominasi Berbeda] Nilai setoran (${depEth} ETH) berbeda dengan nominal pencairan (${totalWithdrawnEth} ETH).`);
      }

      // 2. Pilar 2: Temporal Proximity
      const deltaMinutes = Math.max(0, Math.floor((withdrawTimestamp - cand.timestamp) / 60));
      if (isDenomMatch && deltaMinutes <= 15) {
        score += 20;
        findings.push(`⚡ [Kedekatan Waktu Ekstrem] Dana dicairkan hanya ${deltaMinutes} menit setelah setoran.`);
      } else if (deltaMinutes <= 15) {
        score += 10;
        findings.push(`⚡ [Kedekatan Waktu] Dana dicairkan hanya ${deltaMinutes} menit setelah setoran.`);
      } else if (deltaMinutes <= 120) {
        score += 5;
        findings.push(`⏱️ [Jeda Normal] Dana dicairkan ${deltaMinutes} menit setelah setoran.`);
      }

      // 4. Pilar 3: Common Gas Funder & Cross-Wallet Transfers
      // Check if candidate depositor has transferred ETH to any recipient before or after
      try {
        let gasLinked = false;
        // Search past blocks for direct transfer from depositor to recipients
        const scanStart = Math.max(0, cand.blockNumber - 50);
        for (let b = scanStart; b <= targetReceipt.blockNumber; b++) {
          let block = blockCache.get(b);
          if (!block) {
            block = await this.provider.getBlock(b, true);
            if (block) blockCache.set(b, block);
          }
          if (block && block.prefetchedTransactions) {
            for (const txItem of block.prefetchedTransactions) {
              if (txItem.from.toLowerCase() === cand.depositor && recipients.includes(txItem.to?.toLowerCase() || "")) {
                gasLinked = true;
                score += 30;
                findings.push(`🚨 [Tautan Gas Terbuka] Penyetor (${cand.depositor}) pernah mentransfer ETH langsung ke penerima (${txItem.to}) pada blok #${b}!`);
                break;
              }
            }
          }
          if (gasLinked) break;
        }
      } catch (err) {
        // Fallback if provider block transactions prefetch fails
      }

      // Cap score to 100
      score = Math.min(100, score);

      // Confidence badge
      let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (score >= 80) {
        confidence = "HIGH";
      } else if (score >= 45) {
        confidence = "MEDIUM";
      }

      candidates.push({
        candidateIndex: i + 1,
        leafIndex: cand.leafIndex,
        depositorAddress: cand.depositor,
        depositTxHash: cand.txHash,
        depositBlock: cand.blockNumber,
        depositTimestamp: cand.timestamp,
        depositAmountEth: depEth,
        commitmentHex: cand.commitmentHex,
        timeDeltaMinutes: deltaMinutes,
        score,
        confidence,
        findings,
      });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const primeSuspect = candidates.length > 0 && candidates[0].score >= 45 ? candidates[0] : null;

    let executiveSummary = "";
    if (primeSuspect && primeSuspect.confidence === "HIGH") {
      executiveSummary = `DITEMUKAN BUKTI KUAT: Alamat ${primeSuspect.depositorAddress} teridentifikasi sebagai TERSANGKA UTAMA dengan Skor Keyakinan ${primeSuspect.score}% (HIGH CONFIDENCE). De-anonimisasi berhasil karena ukuran anonymity set runtuh (k=${anonymitySetSize}) dan kesesuaian parameter on-chain.`;
    } else if (primeSuspect && primeSuspect.confidence === "MEDIUM") {
      executiveSummary = `INDIKASI AWAL: Alamat ${primeSuspect.depositorAddress} merupakan kandidat mencurigakan teratas dengan Skor Keyakinan ${primeSuspect.score}% (MEDIUM CONFIDENCE). Dibutuhkan data tambahan metadata relayer/ISP untuk konfirmasi 100%.`;
    } else {
      executiveSummary = `DE-ANONIMISASI GAGAL (PRIVASI AMAN): Tidak ditemukan tersangka utama. Setoran telah mengendap (Deposit Aging) dan terlindung di dalam kerumunan penyetor (k=${anonymitySetSize}). Identitas penyetor asli tidak dapat dibuktikan secara statistik.`;
    }

    return {
      investigationId: `INV-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      withdrawTxHash: targetTxHash,
      withdrawBlock: targetReceipt.blockNumber,
      vaultAddress: this.vaultAddress,
      relayerAddress,
      recipients,
      amountPerRecipientEth,
      totalWithdrawnEth,
      merkleRootHex,
      nullifierHashHex,
      anonymitySetSize,
      primeSuspect,
      candidates,
      executiveSummary,
    };
  }
}
