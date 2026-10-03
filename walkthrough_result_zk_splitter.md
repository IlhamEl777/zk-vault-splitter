# Walkthrough: ZK Private Vault & 1-to-4 Splitter

Sistem brankas privasi berbasis **Zero-Knowledge Proof (Groth16)** telah selesai dibangun, dikompilasi, dan diverifikasi dengan sukses di atas jaringan simulasi EVM lokal.

---

## 🚀 Ringkasan Solusi

Sistem ini memfasilitasi privasi total saat membagikan dana:
1. **Penyetoran Anonim (Deposit):** Alice menyetorkan 1.0 ETH ke smart contract [ZKVault.sol](file:///Users/ilhamnurelghozy/Documents/Developer/VibeCode/blockchain/zk-splitter-demo/contracts/ZKVault.sol) bersama komitmen matematis `Commitment = Poseidon(nullifier, secret)` yang dicatat dalam Merkle Tree.
2. **Kupon Rahasia (ZK-Proof):** Alice membuat bukti kriptografi tanpa mengungkapkan `secret` atau identitas dompetnya. Sirkuit ZK mengunci 4 dompet penerima (Bob, Charlie, Dave, Eve) agar kupon tidak dapat disabotase.
3. **Pencairan Melalui Kurir (Relayer):** Kurir membawa kupon tersebut ke smart contract. Smart contract memvalidasi bukti ZK di chain, mencairkan dana terbagi rata (masing-masing 0.25 ETH), dan menandai kupon sebagai *spent*.
4. **Hasil On-Chain:** Tidak ada jejak atau korelasi antara dompet Alice dan keempat dompet penerima di blockchain.

---

## 📂 Struktur File yang Dibuat

```
zk-splitter-demo/
├── circuits/
│   └── splitter.circom           # Sirkuit ZK Groth16 (Merkle proof + front-running lock)
├── contracts/
│   ├── IPoseidon.sol             # Antarmuka EVM hasher Poseidon
│   ├── MerkleTreeWithHistory.sol # Pohon Merkle inkremental on-chain (depth 8)
│   ├── Groth16Verifier.sol       # Smart contract verifier ZK hasil kompilasi snarkjs
│   └── ZKVault.sol               # Smart contract brankas utama
├── src/
│   └── zk-utils.ts               # Generator rahasia, Merkle proof, & ZK witness off-chain
├── test/
│   └── zk-splitter.test.ts       # 4 Automated unit tests (Hardhat + Chai)
├── scripts/
│   ├── setup-circuits.ts         # Kompilasi circom & Groth16 trusted setup
│   └── deploy-and-simulate.ts    # Simulasi visual interaktif end-to-end
├── hardhat.config.ts             # Konfigurasi Hardhat
└── tsconfig.json                 # Konfigurasi TypeScript
```

---

## 🧪 Hasil Verifikasi & Pengujian

### 1. Automated Unit Tests (`npx hardhat test`)
Semua 4 skenario pengujian lulus dalam 3 detik:
```
  ZK Private Vault & 1-to-4 Splitter
    ✔ Should deposit 1.0 ETH and update on-chain Merkle root correctly (151ms)
    ✔ Should successfully withdraw and split 1.0 ETH across 4 recipients via Relayer (472ms)
    ✔ Should prevent double-spending with the same ZK coupon / nullifier (351ms)
    ✔ Should prevent front-running: Relayer cannot substitute a recipient address (352ms)

  4 passing (3s)
```

### 2. Simulasi End-to-End (`npx hardhat run scripts/deploy-and-simulate.ts`)
```
================================================================================
             ZK-VAULT & 1-TO-4 PRIVATE SPLITTER SIMULATION                      
================================================================================

📌 [1. DEPLOYMENT] Menggelar Kontrak ke Jaringan EVM Lokal...
   - Poseidon Hasher : 0x5FbDB2315678afecb367f032d93F642f64180aa3
   - Groth16Verifier : 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
   - ZKVault (Brankas): 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

💰 [2. INITIAL BALANCES] Saldo Awal Semua Pihak:
   - Alice (Penyetor)  : 10000.0000 ETH (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
   - Relayer (Kurir)   : 10000.0000 ETH (0x976EA74026E726554dB657fA54763abd0C3a0aa9)
   - Bob      (Penerima): 10000.0000 ETH
   - Charlie  (Penerima): 10000.0000 ETH
   - Dave     (Penerima): 10000.0000 ETH
   - Eve      (Penerima): 10000.0000 ETH

🔐 [3. DEPOSIT] Alice Mempersiapkan Rahasia & Menyetor ke Brankas:
   - Secret (rahasia Alice)     : 212365882215180...
   - Nullifier (kunci kupon)    : 173477463670863...
   - Commitment = H(null, sec)  : 126054595368638...
   - NullifierHash = H(null)    : 123425008185597...

   >> Alice mentransfer 1.0 ETH + commitment ke ZKVault...
   ✅ Deposit berhasil! Tx Hash: 0x2aeefcaf845c348cbaa951415163979a2470faf0d50e943178d66ef73ae8504a
   ✅ Leaf Index di Merkle Tree: 0
   ✅ Saldo Brankas saat ini: 1.0000 ETH

⚡ [4. ZK-PROOF GENERATION] Alice Membuat Bukti Matematika (Off-chain):
   ✅ ZK-Proof (Groth16) berhasil digenerate dalam 863 ms!

🚚 [5. RELAYER WITHDRAWAL] Kurir Menyerahkan Kupon ke Brankas:
   Transaksi dipanggil oleh Relayer: 0x976EA74026E726554dB657fA54763abd0C3a0aa9
   Identitas Alice TIDAK ADA sama sekali dalam transaksi ini!
   ✅ Pencairan berhasil! Tx Hash: 0x9262cf79b7b7d6e5cf31dad4c1282bec628231d148cf7980b95c81cf18b4b12a

📊 [6. FINAL BALANCES & AUDIT RESULT]:
--------------------------------------------------------------------------------
   - Alice (Penyetor)  : 9998.9993 ETH (Berkurang ~1.0 ETH)
   - Relayer (Kurir)   : 9999.9995 ETH (Hanya bayar gas fee)
   - Bob      (Penerima): 10000.2500 ETH [Bertambah tepat +0.25 ETH!]
   - Charlie  (Penerima): 10000.2500 ETH [Bertambah tepat +0.25 ETH!]
   - Dave     (Penerima): 10000.2500 ETH [Bertambah tepat +0.25 ETH!]
   - Eve      (Penerima): 10000.2500 ETH [Bertambah tepat +0.25 ETH!]
   - Brankas (ZKVault) : 0.0000 ETH (Saldo sisa)
--------------------------------------------------------------------------------
```

---

## 🛡️ Analisis Keamanan & Fitur Proteksi

1. **Unlinkability (Anonimitas Penuh):**
   Pada blockchain explorer, hanya tercatat dua transaksi terpisah:
   - `Alice -> ZKVault.deposit(commitment)` (hanya hash commitment yang tersimpan).
   - `Relayer -> ZKVault.withdrawSplit(proof, root, nullifierHash, recipients)`.
   Tidak ada jejak graf transaksi antara Alice dan Bob, Charlie, Dave, ataupun Eve.
2. **Anti Double-Spending:**
   Begitu penarikan berhasil, `nullifierSpent[nullifierHash]` ditandai `true`. Upaya mencairkan ulang dengan kupon yang sama langsung ditolak smart contract.
3. **Anti Front-Running / Tampering:**
   Keempat alamat penerima di-hash dan di-bind langsung ke public input bukti Groth16. Jika kurir/relayer mencoba mengganti salah satu penerima dengan alamat dompetnya sendiri, fungsi verifikasi on-chain otomatis gagal (*reverted with "Invalid Zero-Knowledge proof"*).
