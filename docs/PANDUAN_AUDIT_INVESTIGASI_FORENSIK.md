# 🕵️ PANDUAN AUDIT & INVESTIGASI FORENSIK DIGITAL
## Protokol Privasi ZK-Vault Splitter (On-Chain De-anonymization SOP)

Dokumen ini merupakan panduan standar operasional (*Standard Operating Procedure / SOP*) bagi auditor keamanan blockchain, analis kepatuhan regulasi (*AML/CFT Compliance*), dan penyelidik kejahatan siber (*cybercrime forensic investigators*) dalam membongkar, menganalisis, dan melacak transaksi pencucian uang yang memanfaatkan protokol **ZK-Vault Splitter**.

---

## 📌 Daftar Isi
1. [Ringkasan Eksekutif & Prinsip Investigasi](#1-ringkasan-eksekutif--prinsip-investigasi)
2. [Anatomi Kriptografi vs Celah Forensik](#2-anatomi-kriptografi-vs-celah-forensik)
3. [Metodologi Investigasi 5 Pilar](#3-metodologi-investigasi-5-pilar)
4. [SOP Penyelidikan Langkah-demi-Langkah](#4-sop-penyelidikan-langkah-demi-langkah)
5. [Matriks Pembobotan Keyakinan (Confidence Score)](#5-matriks-pembobotan-keyakinan-confidence-score)
6. [Tindakan Hukum & Jalur Subpoena Bursa (CEX)](#6-tindakan-hukum--jalur-subpoena-bursa-cex)
7. [Template Laporan Temuan Barang Bukti](#7-template-laporan-temuan-barang-bukti)

---

## 📌 1. Ringkasan Eksekutif & Prinsip Investigasi

Dalam kasus tindak pidana siber, pemerasan (*ransomware*), atau pencucian uang berbasis kripto (*cryptocurrency money laundering*), pelaku kerap memanfaatkan protokol privasi Zero-Knowledge (seperti **ZK-Vault Splitter**) untuk mengaburkan asal-usul dana sebelum disebarkan ke dompet penampung.

### Realitas Hukum & Forensik:
> **"Kriptografi ZK-SNARK memutus tautan matematis langsung di atas rantai (on-chain), namun TIDAK DAPAT menghapus jejak perilaku manusia, metadata jaringan, dan topologi graf transaksi."**

Sebagai investigator, tujuan kita bukan meretas matematika kurva eliptik Groth16, melainkan **mengeksploitasi kebocoran metadata di sekitar bukti tersebut** untuk mengidentifikasi dengan derajat keyakinan hukum (*legal standard of proof*) siapakah entitas di balik setoran brankas.

---

## 🔍 2. Anatomi Kriptografi vs Celah Forensik

| Lapisan Protokol | Klaim Perlindungan ZK | Titik Lemah / Celah Forensik (*Investigative Vector*) |
| :--- | :--- | :--- |
| **Setoran (`deposit`)** | Penyetor hanya memasukkan `commitment = Poseidon(nullifier, secret)`. Alamat penyetor tidak dicatat di daun pohon. | **Waktu & Volume:** Transaksi setoran dicatat di blok dengan stempel waktu, nilai denominasi, dan alamat pengirim (`tx.origin`). |
| **Pohon Merkle** | Bukti ZK membuktikan kepemilikan salah satu daun dari $2^8 = 256$ kapasitas tanpa menyebut nomor daun. | **Ukuran Anonymity Set ($k$):** Bukti mengacu pada `root` tertentu. Investigator dapat merekonstruksi tepat berapa daun yang ada saat `root` dibuat. Jika $k=1$, penyetor 100% pasti. |
| **Pencairan (`withdrawSplit` / `withdrawScheduledSplit`)** | Dilakukan oleh Kurir (*Relayer*), dengan opsi instan atau berjangka (*timelock escrow*), sehingga alamat penyetor tidak ada dalam transaksi pencairan. | **Tautan Gas & Konsolidasi:** Siapa yang mendanai gas 4 penerima? Ke mana 4 penerima mengirim dana setelahnya (*peeling chains / sweep*)? Serta bagaimana korelasi waktu slot eksekusi *Keeper* (`ScheduledPayoutDispatched`)? |
| **Kurir / Relayer & Keeper** | Menjamin penyetor tidak butuh saldo gas untuk mencairkan. | **Metadata Jaringan:** API Bridge dan RPC node menyimpan alamat IP, *user-agent*, dan *request payload* pada detik transaksi dibuat. |

---

## 🔬 3. Metodologi Investigasi 5 Pilar

```
           ┌────────────────────────────────────────────────────────┐
           │        HASIL PENCAIRAN ON-CHAIN (WITHDRAWAL)           │
           │  (Instant withdrawSplit atau ScheduledSplitCreated)   │
           └───────────────────────────┬────────────────────────────┘
                                       │
         ┌─────────────────────────────┼────────────────────────────┐
         ▼                             ▼                            ▼
┌──────────────────┐         ┌───────────────────┐        ┌──────────────────┐
│     PILAR 1      │         │      PILAR 2      │        │     PILAR 3      │
│  Anonymity Set   │         │    Temporal &     │        │ Common Gas Funder│
│  Reconstruction  │         │   Denomination    │        │    & Peeling     │
└────────┬─────────┘         └─────────┬─────────┘        └────────┬─────────┘
         │                             │                           │
         └─────────────────────────────┼───────────────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │              PILAR 4              │
                     │  Forensik Jaringan & Relayer API  │
                     └─────────────────┬─────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │              PILAR 5              │
                     │  Forensic Likelihood Scoring (100)│
                     └─────────────────┬─────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │   IDENTIFIKASI TERSANGKA UTAMA    │
                     │   (atau STATUS PRIVASI AMAN k>1)  │
                     └───────────────────────────────────┘
```

### Pilar 1: Rekonstruksi Pohon Merkle ($k$-Anonymity Analysis)
- Kontrak `ZKVault` memverifikasi `isKnownRoot(_root)`.
- Telusuri kembali sejarah blok: temukan pada blok berapa `root` tersebut pertama kali tercipta.
- Hitung jumlah deposit sah sebelum atau pada blok pembuatan root ($k$).
- **Aturan Investigasi:**
  - Jika $k = 1$: **De-anonimisasi Deterministik (100% Pasti)**. Tidak ada kemungkinan tersangka lain (*Anonymity Collapse*).
  - Jika $2 \le k \le 5$: **Kandidat Sangat Terbatas (Probabilitas Awal $1/k$)**. Sangat mudah dieliminasi dengan pilar berikutnya.
  - Jika $k > 5$: Privasi penyetor terlindung di dalam kerumunan (*Deposit Aging / Decoy Traffic*), menghasilkan status **"DE-ANONIMISASI GAGAL (PRIVASI AMAN)"** kecuali ada tautan gas langsung di Pilar 3.

### Pilar 2: Korelasi Temporal & Denominasi (Value/Time Fingerprinting)
- **Denomination Shift:** Kontrak memiliki fungsi `setDenomination(newDenom)`. Jika transaksi pencairan menghasilkan total $1.0 \text{ ETH}$, carilah setoran yang terjadi pada periode di mana denominasi brankas disetel pada nilai tersebut.
- **Analisis Split Mode:**
  - *Instant Equal Split:* 4 penerima mendapatkan nominal identik di detik yang sama (korelasi klaster tinggi).
  - *Stealth Staggered Split:* Nominal diacak dan slot didistribusikan berjangka (0-120s) via Timelock Escrow. Mengaburkan korelasi temporal dan nominal kembar.
- **Time-Delta Decay:** Penyetor yang tergesa-gesa mencairkan dana sesaat setelah deposit memiliki skor kecurigaan tertinggi.

### Pilar 3: Analisis Graf Rantai (Common Gas Funder & Peeling Chains)
- **Heuristik Penyandang Gas (Common Gas Funder):** 4 dompet penerima membutuhkan ETH untuk memindahkan dana hasil split. Periksa riwayat transfer pertama yang masuk ke 4 dompet penerima. Jika ada dompet penyetor kandidat yang pernah mentransfer gas ke salah satu atau semua penerima, ini adalah bukti *smoking gun*.
- **Heuristik Pengumpulan Dana (Sweeping / Peeling Chains):** Pantau alur keluarnya dana dari 4 penerima. Apakah dana tersebut diteruskan kembali ke satu alamat agregator? Pola ini membuktikan bahwa 4 penerima adalah dompet boneka (*Sybil wallets*) milik satu aktor yang sama.
- **Optimasi Pemindaian Caching:** Mesin investigasi menggunakan `blockCache` untuk menelusuri 50+ blok ke belakang secara instan tanpa membebani node RPC.

### Pilar 4: Jejak Metadata Server Relayer & API Bridge
- Ambil log server web API Bridge (`api-bridge.ts`):
  - Cari timestamp pemanggilan `POST /api/deposit` dan `POST /api/prove`.
  - Bandingkan IP Address, Geolocation ISP, header `User-Agent`, dan sidik jari TLS (JA3/JA4 fingerprint).
  - Jika `POST /api/deposit` dan `POST /api/prove` berasal dari alamat IP yang sama atau subnet ASN yang sama, identitas penyetor dan pemohon pencairan identik secara fisik.

### Pilar 5: Matriks Pembobotan Keyakinan (Forensic Scoring)
Investigator menghitung total poin kecurigaan untuk setiap kandidat di dalam kumpulan $k$-anonymity.

---

## 🚦 4. SOP Penyelidikan Langkah-demi-Langkah

### Tahap 1: Inisiasi Kasus & Penangkapan Data On-Chain
1. Dapatkan **Hash Transaksi Pencairan** (`WithdrawSplit`, `ScheduledSplitCreated`, atau eksekusi sekunder `ScheduledPayoutDispatched`).
2. Jika transaksi yang diinput adalah eksekusi sekunder keeper (`ScheduledPayoutDispatched`), mesin investigasi secara otomatis menelusuri `batchId` ke transaksi induk pembuatannya (`ScheduledSplitCreated`).
3. Jalankan dekode data transaksi (*calldata & event logs*):
   - Ambil `root`, `nullifierHash`, `recipients[0..3]`, nominal per penerima, dan alamat `relayer`.
   - Catat nomor blok pencairan ($B_{withdraw}$) dan stempel waktu ($T_{withdraw}$).

### Tahap 2: Audit Rekursif Merkle Tree
1. Query semua event `Deposit(commitment, leafIndex, timestamp)` pada `ZKVault` dari blok 0 hingga $B_{withdraw}$.
2. Simulasikan ulang penambahan daun satu per satu menggunakan algoritma Poseidon Merkle Tree.
3. Kunci subset transaksi deposit yang akarnya cocok dengan `root` pada transaksi penarikan.
4. Buat daftar kandidat alamat penyetor ($A_1, A_2, \dots, A_k$).

### Tahap 3: Uji Graf Relasi Antar-Dompet
1. Untuk setiap kandidat $A_i$:
   - Periksa apakah $A_i$ pernah mengirim transaksi langsung ke salah satu dari `recipients[0..3]`.
   - Periksa apakah saldo gas awal salah satu `recipients` didanai oleh $A_i$.
   - Periksa apakah ada kesamaan pola penarikan dari bursa (CEX) yang sama pada waktu yang berdekatan.

### Tahap 4: Eksekusi Skrip Forensik
Gunakan skrip audit investigasi resmi atau antarmuka visualizer:
```bash
# Melalui API Bridge
curl -X POST http://127.0.0.1:3001/api/investigate -H "Content-Type: application/json" -d '{"txHash":"<TX_HASH_WITHDRAWAL>"}'
```
Atau klik tombol **`🕵️ Audit Forensik`** pada navbar visualizer.

---

## 📊 5. Matriks Pembobotan Keyakinan (Confidence Score)

Skor dihitung dari skala **0 hingga 100 poin** untuk setiap kandidat:

| Parameter Uji Forensik | Kondisi Terpenuhi | Poin Tambahan |
| :--- | :--- | :---: |
| **Ukuran Anonymity Set ($k$)** | $k = 1$ (Satu-satunya setoran sah sebelum root) | **+60 poin** |
| | $2 \le k \le 4$ | **+30 poin** |
| | $k \ge 5$ | **+10 poin** |
| **Pencocokan Nilai Denominasi** | Nilai setoran persis sama dengan total pencairan | **+15 poin** |
| **Kedekatan Temporal** | Deposit terjadi < 100 blok sebelum pencairan | **+15 poin** |
| **Common Gas Funder** | Penyetor pernah mentransfer ETH ke salah satu penerima | **+30 poin** |
| **Prior Contract Interactivity** | Penyetor dan penerima pernah berinteraksi di kontrak yang sama | **+10 poin** |
| **Jejak Relayer / IP Cocok** | IP request deposit sama dengan IP request prove (Off-Chain) | **+25 poin** |

### Ambang Batas Keyakinan (*Confidence Thresholds*):
- 🔴 **HIGH CONFIDENCE ($\ge 80\%$)**: **Tersangka Utama Teridentifikasi (*Prime Suspect Confirmed*)**. Memenuhi standar bukti untuk penerbitan laporan forensik dan tindakan hukum.
- 🟡 **MEDIUM CONFIDENCE ($45\% - 79\%$)**: **Kandidat Kuat Berindikasi (*Strong Candidate of Interest*)**. Diperlukan data tambahan (subpoena log ISP/CEX).
- ⚪ **LOW / SAFE ($< 45\%$)**: **De-anonimisasi Gagal (Privasi Aman)**. Penyetor terlindung di dalam himpunan kerumunan anonim ($k > 1$) berkat penuaan deposit (*Deposit Aging*) atau setoran umpan (*Decoy Traffic*).

---

## 🏛️ 6. Tindakan Hukum & Jalur Subpoena Bursa (CEX)

Jika penyelidikan on-chain mengarah pada satu tersangka dengan skor $\ge 80\%$:
1. **Analisis Asal Dana (Source of Funds / Backward Taint):**
   - Lacak dompet penyetor ke belakang: dari mana saldo ETH diperoleh?
   - Temukan transaksi masuk dari bursa terpusat (misal Binance, Indodax, Coinbase, Kraken).
   - Catat Deposit Address atau Withdrawal Internal Tx ID.
2. **Penerbitan Surat Perintah / Permohonan Informasi (Legal Subpoena):**
   - Kirim permohonan resmi kepada tim *Compliance / Law Enforcement Liaison* bursa terkait:
     - Nomor Akun Pengguna / User ID.
     - Nama lengkap, alamat, nomor telepon, dan data KTP/Paspor (KYC).
     - Riwayat login IP dan rekening bank penarikan rupiah/fiat.
3. **Penyitaan & Pembekuan Aset (Asset Freeze):**
   - Minta bursa memasukkan dompet penyetor dan 4 penerima ke dalam daftar pantau (*Blacklist / Freeze Order*).

---

## 📄 7. Template Laporan Temuan Barang Bukti

```markdown
# 🛡️ LAPORAN AUDIT INVESTIGASI FORENSIK DIGITAL
**Nomor Berkas Kasus:** INV-ZK-2026-XXXX
**Tanggal Investigasi:** [Tanggal]
**Mode Split:** [Instant 25% Equal / Stealth Staggered Split]
**Status Keyakinan:** [🔴 TINGGI / 🟡 SEDANG / ⚪ AMAN (DE-ANONIMISASI GAGAL)]

### 1. Data Transaksi Target
- Hash Pencairan Induk: 0x...
- Hash Eksekusi Terkait: [Jika berlaku]
- Brankas Kontrak: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
- Total Denominasi: 1.0 ETH
- Alamat Relayer: 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
- 4 Dompet Penerima:
  1. [Alamat 1] - [Nominal & Status Slot]
  2. [Alamat 2] - [Nominal & Status Slot]
  3. [Alamat 3] - [Nominal & Status Slot]
  4. [Alamat 4] - [Nominal & Status Slot]

### 2. Temuan Forensik On-Chain
- Ukuran Anonymity Set pada Root: k = [N]
- Status Pertahanan Pool: [k=1 Collapse / k>1 Aged Decoy Shield]
- Daftar Kandidat Penyetor:
  - Kandidat A: 0x... (Skor: 92% - TERSANGKA UTAMA)
  - Kandidat B: 0x... (Skor: 15%)
- Tautan Bukti Kunci:
  [Jelaskan korelasi gas / temporal / keunikan root]

### 3. Kesimpulan & Rekomendasi
[Pilih salah satu:]
- Entitas pemilik alamat 0x... terbukti secara forensik on-chain sebagai sumber penyetor asli dari transaksi penarikan tersebut. Direkomendasikan segera melayangkan surat permohonan data KYC ke bursa terkait.
- Privasi terlindung sempurna di dalam kerumunan setoran (k=[N]). Identitas penyetor asli tidak dapat dibuktikan secara statistik maupun on-chain.
```

---
*Dokumen ini diterbitkan sebagai panduan resmi investigasi forensik protokol privasi ZK-Vault Splitter.*
