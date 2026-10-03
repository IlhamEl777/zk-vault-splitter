# 🛡️ LAPORAN AUDIT FORENSIK DIGITAL BLOCKCHAIN
**Nomor Berkas:** INV-568983
**Waktu Audit:** 2026-10-03T17:29:28.983Z
**Target Tx:** `0x77f3e583b54b70ada7a8356b8fa7e180c39e9440bcd0ccb7c6ddf3647c404243`
**Status Keyakinan:** HIGH

---

## 📌 Ringkasan Eksekutif
DITEMUKAN BUKTI KUAT: Alamat 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 teridentifikasi sebagai TERSANGKA UTAMA dengan Skor Keyakinan 85% (HIGH CONFIDENCE). De-anonimisasi berhasil karena ukuran anonymity set runtuh (k=18) dan kesesuaian parameter on-chain.

---

## 📋 Data Transaksi Pencairan (Target)
- **Brankas (ZKVault):** `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`
- **Kurir (Relayer):** `0x976ea74026e726554db657fa54763abd0c3a0aa9`
- **Total Dana Keluar:** 7.77 ETH (dipecah rata ke 4 penerima @ 1.9425 ETH)
- **Merkle Root Publik:** `0x1311345a5bb7abcb07a1cc6d8dcdfd34718c8abad0fa385014d5b69dd52f5009`
- **Nullifier Hash Terpakai:** `0x1cda9834d5ef3a13b0b5b6800ada561d83d44472d1d4b731c233382d72ff2b0e`
- **4 Dompet Penerima:**
  1. `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc`
  2. `0x90f79bf6eb2c4f870365e785982e1f101e93b906`
  3. `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65`
  4. `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc`

---

## 🔍 Analisis Anonymity Set & Pohon Merkle (Pilar 1)
- **Ukuran Anonymity Set ($k$):** **18**
- **Interpretasi Forensik:**
> Terdapat 18 setoran yang bersaing di dalam pohon Merkle pada saat penarikan.

---

## 📊 Matriks Kandidat Tersangka
| No | Alamat Penyetor | Blok Deposit | Nominal | Jeda Waktu | Skor Keyakinan | Status |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | #76 | 7.77 ETH | 0 mnt | **85%** | **HIGH** |
| 2 | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | #72 | 1.0 ETH | 1 mnt | **10%** | **LOW** |
| 3 | `0x90f79bf6eb2c4f870365e785982e1f101e93b906` | #73 | 1.0 ETH | 1 mnt | **10%** | **LOW** |
| 4 | `0x90f79bf6eb2c4f870365e785982e1f101e93b906` | #26 | 2.0 ETH | 85 mnt | **5%** | **LOW** |
| 5 | `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc` | #36 | 0.5 ETH | 77 mnt | **5%** | **LOW** |
| 6 | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` | #41 | 0.65 ETH | 76 mnt | **5%** | **LOW** |
| 7 | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` | #43 | 0.65 ETH | 76 mnt | **5%** | **LOW** |
| 8 | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` | #45 | 0.65 ETH | 75 mnt | **5%** | **LOW** |
| 9 | `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` | #47 | 0.65 ETH | 61 mnt | **5%** | **LOW** |
| 10 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #50 | 1.0 ETH | 61 mnt | **5%** | **LOW** |
| 11 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #52 | 1.0 ETH | 61 mnt | **5%** | **LOW** |
| 12 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #54 | 1.0 ETH | 61 mnt | **5%** | **LOW** |
| 13 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #57 | 2.0 ETH | 60 mnt | **5%** | **LOW** |
| 14 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #59 | 2.0 ETH | 60 mnt | **5%** | **LOW** |
| 15 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #61 | 2.0 ETH | 60 mnt | **5%** | **LOW** |
| 16 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #64 | 4.0 ETH | 60 mnt | **5%** | **LOW** |
| 17 | `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` | #66 | 4.0 ETH | 60 mnt | **5%** | **LOW** |
| 18 | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` | #69 | 4.0 ETH | 36 mnt | **5%** | **LOW** |

### Temuan Forensik per Kandidat:

#### Kandidat #1: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` (Skor: 85%)
- **Hash Transaksi Setoran:** `0x0ce5027eb6ee7becc3bc998b806b8242ccb728b76e3a4ab205a76c9ec2169c86`
- **Detail Analisis:**
  - 🔴 [Denomination Collapse] Setoran ini adalah SATU-SATUNYA setoran dengan nominal persis 7.77 ETH di seluruh pohon Merkle (k_denom = 1)!
  - ⚡ [Kedekatan Waktu Ekstrem] Dana dicairkan hanya 0 menit setelah setoran.


#### Kandidat #2: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` (Skor: 10%)
- **Hash Transaksi Setoran:** `0xb76a74167400725e82f595242a26015686ccda3053161c02f61d6b34104bd12f`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (1.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⚡ [Kedekatan Waktu] Dana dicairkan hanya 1 menit setelah setoran.


#### Kandidat #3: `0x90f79bf6eb2c4f870365e785982e1f101e93b906` (Skor: 10%)
- **Hash Transaksi Setoran:** `0x9d19e792883651eff9db6dc0a58f2863afb6c8ab271b949c769b808fa990f702`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (1.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⚡ [Kedekatan Waktu] Dana dicairkan hanya 1 menit setelah setoran.


#### Kandidat #4: `0x90f79bf6eb2c4f870365e785982e1f101e93b906` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x9de83c1985068a2f39034c5efc29189e5dcbdff699b14456de51b4034af14916`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (2.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 85 menit setelah setoran.


#### Kandidat #5: `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x8d5ed6b73f6cd6af58051937495f5498c8f23343b53315c997deba7a6965d65e`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (0.5 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 77 menit setelah setoran.


#### Kandidat #6: `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x783ccff713995105d9b8a1516bb86ec879bd09cc2869d35393d6dceb1c013b26`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (0.65 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 76 menit setelah setoran.


#### Kandidat #7: `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xed9009fc2a822a047210341542205306a386825ecddbe8f9add3e266eaa745b8`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (0.65 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 76 menit setelah setoran.


#### Kandidat #8: `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xf4e625183ba2c282c2fd47e4359afe4bbde441a9ed6e6c709bfeece4218ab311`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (0.65 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 75 menit setelah setoran.


#### Kandidat #9: `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xb607fdd4e9a569869373ac5646f7a55615879fe776fff33dab2ffb85502f1ba5`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (0.65 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 61 menit setelah setoran.


#### Kandidat #10: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x162bf3872d54ed763b71a651978b875db5c5523ed7e34a295d4f123769580e40`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (1.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 61 menit setelah setoran.


#### Kandidat #11: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x0a843231d645b6d5167125e7c842f0d297eb90ba89ff1801a6bb498d966e4725`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (1.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 61 menit setelah setoran.


#### Kandidat #12: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xecbf0c8fd6d2e5de41c8e435429b3eb735e1dbf816e32a64c56f1eac50484bd6`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (1.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 61 menit setelah setoran.


#### Kandidat #13: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xeb46ad3292e7f666ac68f380e3f1a224b30adfa0750ea6eeeba460cc6c09c494`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (2.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 60 menit setelah setoran.


#### Kandidat #14: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x56316f38e70feb9b18da6579a6d7842b8fd646f379e711aed4f115495c04a79b`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (2.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 60 menit setelah setoran.


#### Kandidat #15: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xb9531d83920d1fe1e367ffde3589a5aec1b6e9f11c87d18a4c19406e1aa0f816`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (2.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 60 menit setelah setoran.


#### Kandidat #16: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xd3fc62cf9003f21eecb268ad65cb44b345a1ce1c90d2f161b33341b0334b2bcf`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (4.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 60 menit setelah setoran.


#### Kandidat #17: `0x15d34aaf54267db7d7c367839aaf71a00a2c6a65` (Skor: 5%)
- **Hash Transaksi Setoran:** `0xc44d374a31612693fe4aa9a9e971627e30bde0b7090840d545005d7890fd5bbe`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (4.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 60 menit setelah setoran.


#### Kandidat #18: `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` (Skor: 5%)
- **Hash Transaksi Setoran:** `0x335ed7dbecaa2bf5d0d662393203a33039e43f4c99018d366bee014703f5619e`
- **Detail Analisis:**
  - ⚪ [Denominasi Berbeda] Nilai setoran (4.0 ETH) berbeda dengan nominal pencairan (7.77 ETH).
  - ⏱️ [Jeda Normal] Dana dicairkan 36 menit setelah setoran.


---

## ⚖️ Rekomendasi Tindak Lanjut Hukum & Forensik
1. **Penerbitan Surat Perintah CEX:** Mengajukan penelusuran KYC ke bursa kripto tempat penyetor `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` melakukan pendanaan awal (*source of funds*).
2. **Pemantauan Dompet Penerima:** Memasang *alert* on-chain terhadap 4 dompet penerima untuk mendeteksi *sweeping* dana ke alamat konsolidasi.

---
*Laporan ini dihasilkan secara otomatis oleh Mesin Audit Forensik ZK-Vault Splitter.*
