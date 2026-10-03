// ============================================================================
// ZK-SPLITTER WORKFLOW GRAPH - DYNAMIC SETUP & REAL HARDHAT EVM CONTROLLER
// ============================================================================

interface NodePos {
  x: number;
  y: number;
}

interface NodeData {
  id: string;
  name: string;
  type: string;
  fields: Record<string, string>;
  description: string;
}

interface AccountMeta {
  key: string;
  name: string;
  address: string;
  shortAddr: string;
}

const ACCOUNTS_DATA: Record<string, AccountMeta> = {
  alice: {
    key: "alice",
    name: "Alice",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    shortAddr: "0x7099...79C8",
  },
  bob: {
    key: "bob",
    name: "Bob",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    shortAddr: "0x3C44...93BC",
  },
  charlie: {
    key: "charlie",
    name: "Charlie",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    shortAddr: "0x90F7...b906",
  },
  dave: {
    key: "dave",
    name: "Dave",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    shortAddr: "0x15d3...6A65",
  },
  eve: {
    key: "eve",
    name: "Eve",
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    shortAddr: "0x9965...A4dc",
  },
};

class ZKWorkflowGraph {
  canvas: HTMLElement;
  container: HTMLElement;
  cablesSvg: SVGSVGElement;
  minimapCanvas: HTMLCanvasElement;
  minimapCtx: CanvasRenderingContext2D;
  defenseOverlay: HTMLElement;
  defenseStamp: HTMLElement;
  rightPanel: HTMLElement;
  drawerToggleBtn: HTMLElement;
  drawerArrow: HTMLElement;

  zoomLevel: number = 1.0;
  panX: number = 0;
  panY: number = 0;
  isPanning: boolean = false;
  startPanX: number = 0;
  startPanY: number = 0;

  activeDragNode: HTMLElement | null = null;
  dragOffsetX: number = 0;
  dragOffsetY: number = 0;

  dotGridEl: HTMLElement | null = null;
  isSpacePressed: boolean = false;
  isPanToolActive: boolean = false;

  isRunning: boolean = false;
  selectedNodeId: string = "alice";
  liveTimerInterval: number | null = null;

  // Dynamic Multi-Account & Vault Configuration
  depositorKey: string = "alice";
  recipientKeys: string[] = ["bob", "charlie", "dave", "eve"];
  vaultDenomination: number = 1.0;

  accountBalances: Record<string, number> = {
    alice: 10000.0,
    bob: 10000.0,
    charlie: 10000.0,
    dave: 10000.0,
    eve: 10000.0,
  };
  vaultBalance: number = 0.0;
  relayerBalance: number = 10000.0;
  vaultAddress: string = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

  currentRound: number = 0;
  selectedScenario: "normal" | "hijack" | "doublespend" = "normal";
  previousNullifiers: string[] = [];

  // On-Chain Receipt & Last Tx Tracking
  latestDepositTxHash: string = "";
  latestWithdrawTxHash: string = "";
  toastTimeout: any = null;

  // Active round secret preimages
  currentSecretHex: string = "0x8f4d...391a";
  currentNullifierHex: string = "0xc1a9...e27b";
  currentCommitmentHex: string = "0x9287...036a";
  currentNullifierHashHex: string = "0x1369...4841";

  // Pluggable Interactive Wiring State
  activeConnections: Record<string, string> = {
    "port-alice-out": "port-vault-in",
    "port-vault-out": "port-prover-in",
    "port-prover-out": "port-relayer-in",
    "port-relayer-out": "port-recipients-in",
  };

  readonly requiredConnections: Record<string, string> = {
    "port-alice-out": "port-vault-in",
    "port-vault-out": "port-prover-in",
    "port-prover-out": "port-relayer-in",
    "port-relayer-out": "port-recipients-in",
  };

  isDraftingCable: boolean = false;
  draftSourcePort: HTMLElement | null = null;
  draftSourceDir: "in" | "out" = "out";
  cableDraftEl: SVGPathElement | null = null;
  cableTooltipEl: HTMLElement | null = null;
  currentHoveredTarget: HTMLElement | null = null;

  // Node database for inspector
  nodeDatabase: Record<string, NodeData> = {
    alice: {
      id: "alice",
      name: "1. Alice (Penyetor Rahasia)",
      type: "Depositor / Preimage Generator",
      description:
        "Penyetor membuat 2 angka rahasia besar (secret & nullifier) berukuran 254-bit di komputernya. Identitas dompetnya hanya tercatat saat menyetor dana ke brankas, tidak pernah tercatat saat pencairan.",
      fields: {
        "Nama Penyetor": "Alice",
        "Alamat Dompet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "Saldo Terkini": "10,000.0000 ETH",
        "Private Secret": "21236588221518091873291823...",
        "Private Nullifier": "17347746367086381923091823...",
        "Commitment Hash": "Poseidon(nullifier, secret)",
        "Ukuran Setoran": "1.00 ETH per putaran",
      },
    },
    vault: {
      id: "vault",
      name: "2. ZKVault (Brankas Digital On-Chain)",
      type: "Smart Contract (EVM)",
      description:
        "Smart contract brankas yang menyimpan dana setoran dan mengelola pohon Merkle inkremental berkedalaman 8 tingkat (kapasitas 256 deposit). Hanya komitmen hash yang disimpan di on-chain.",
      fields: {
        "Alamat Kontrak": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
        "Merkle Hasher": "Poseidon (2 inputs) Bytecode",
        "Kapasitas Tree": "256 Daun (Depth 8)",
        "Ukuran Denominasi": "1.00 ETH (Dinamis)",
        "Pencatatan Nullifier": "Mapping(nullifierHash => bool)",
      },
    },
    prover: {
      id: "prover",
      name: "3. ZK-Circuit (Groth16 Prover)",
      type: "Zero-Knowledge Circuit",
      description:
        "Sirkuit matematika circom yang membuktikan penyetor mengetahui preimage yang terdaftar di Merkle Tree brankas tanpa mengungkapkannya, serta mengunci 4 alamat penerima ke dalam bukti matematis.",
      fields: {
        "File Sirkuit": "circuits/splitter.circom",
        "Sistem Pembuktian": "Groth16 (BN254 curve)",
        "Jumlah Constraints": "2,423 R1CS",
        "Waktu Hitung Proof": "260 ms",
        "Public Signals": "[root, nullifierHash, r0, r1, r2, r3]",
        "Proteksi": "Front-running Resistant (Tied to 4 addresses)",
      },
    },
    relayer: {
      id: "relayer",
      name: "4. Relayer (Kurir Pengantar)",
      type: "Independent Courier",
      description:
        "Pihak ketiga atau server kurir yang bertugas mengeksekusi transaksi penarikan di smart contract. Kurir hanya menerima kupon ZK yang sudah jadi dan tidak mengetahui siapa penyetor aslinya.",
      fields: {
        "Alamat Kurir": "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
        "Hubungan ke Penyetor": "NOL (0% Hubungan On-Chain)",
        "Method Panggilan": "ZKVault.withdrawSplit(proof, root, nullifierHash, recipients)",
        "Gas Payer": "Relayer (Kurir)",
      },
    },
    recipients: {
      id: "recipients",
      name: "5. Empat Dompet Penerima (Split)",
      type: "Payout Accounts",
      description:
        "Keempat dompet penerima yang menerima dana terpecah sama rata langsung dari kontrak ZKVault. Mereka dan seluruh publik tidak bisa melacak siapa penyetor dana tersebut.",
      fields: {
        "Penerima 1": "0x3C44...93BC",
        "Penerima 2": "0x90F7...b906",
        "Penerima 3": "0x15d3...6A65",
        "Penerima 4": "0x9965...A4dc",
        "Total Diterima": "1.0000 ETH (0.25 ETH x 4)",
        "Sumber Pengirim": "ZKVault (Bukan Penyetor)",
      },
    },
  };

  get portMeta(): Record<string, { label: string; nodeName: string }> {
    const depName = ACCOUNTS_DATA[this.depositorKey]?.name || "Penyetor";
    return {
      "port-alice-out": { label: `Deposit Commitment (${depName} OUT)`, nodeName: depName },
      "port-vault-in": { label: "Commitment Ingestion (Vault IN)", nodeName: "ZKVault" },
      "port-vault-out": { label: "Merkle Root & Path (Vault OUT)", nodeName: "ZKVault" },
      "port-prover-in": { label: "Root & Witness (Prover IN)", nodeName: "Groth16 Prover" },
      "port-prover-out": { label: "ZK Proof & Kupon (Prover OUT)", nodeName: "Groth16 Prover" },
      "port-relayer-in": { label: "Kupon ZK & 4 Rekening (Relayer IN)", nodeName: "Relayer" },
      "port-relayer-out": { label: "Pencairan Terbagi (Relayer OUT)", nodeName: "Relayer" },
      "port-recipients-in": { label: "Dana Masuk (Penerima IN)", nodeName: "4 Penerima" },
    };
  }

  constructor() {
    this.canvas = document.getElementById("graph-canvas")!;
    this.container = document.getElementById("nodes-container")!;
    this.cablesSvg = document.getElementById("cables-svg") as unknown as SVGSVGElement;
    this.minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext("2d")!;
    this.defenseOverlay = document.getElementById("defense-overlay")!;
    this.defenseStamp = document.getElementById("defense-stamp")!;
    this.rightPanel = document.getElementById("right-panel")!;
    this.drawerToggleBtn = document.getElementById("drawer-toggle-handle")!;
    this.drawerArrow = document.getElementById("drawer-handle-arrow")!;
    this.dotGridEl = document.querySelector(".dot-grid") as HTMLElement;

    this.initEvents();
    this.initPortEvents();
    this.initDynamicSetupControls();
    this.setupForensicModal();
    this.setupOnChainReceiptAndBanner();
    this.setupResizableRightPanel();
    this.setupPanelSegments();
    this.setupPanelTabs();
    this.fetchWithdrawHistory();
    this.updateDynamicUI();
    this.updateAllCables();
    this.drawMinimap();
    this.selectNode("alice");

    // Live Blockchain RPC Sync with Hardhat Node
    this.fetchBlockchainStatus();
    setInterval(() => {
      if (!this.isRunning) {
        this.fetchBlockchainStatus();
      }
    }, 4000);
  }

  // ==========================================================================
  // DYNAMIC SETUP CONTROLS (DEPOSITOR, RECEIVERS, VAULT ETH)
  // ==========================================================================
  initDynamicSetupControls() {
    const selectDepositor = document.getElementById("select-depositor") as HTMLSelectElement;
    if (selectDepositor) {
      selectDepositor.addEventListener("change", async (e) => {
        const newDepositor = (e.target as HTMLSelectElement).value;
        await this.setDepositor(newDepositor);
      });
    }

    const presetPills = document.querySelectorAll("#preset-pills .preset-pill");
    presetPills.forEach((pill) => {
      pill.addEventListener("click", async () => {
        const ethVal = parseFloat(pill.getAttribute("data-eth") || "1.0");
        await this.setDenomination(ethVal);
      });
    });

    const customEthInput = document.getElementById("input-custom-eth") as HTMLInputElement;
    if (customEthInput) {
      customEthInput.addEventListener("change", async () => {
        const val = parseFloat(customEthInput.value);
        if (!isNaN(val) && val >= 0.04) {
          await this.setDenomination(val);
        } else {
          customEthInput.value = this.vaultDenomination.toFixed(2);
        }
      });
    }
  }

  async setDepositor(key: string) {
    if (!ACCOUNTS_DATA[key]) return;
    this.depositorKey = key;
    // Automatically pick the other 4 accounts as recipients
    this.recipientKeys = Object.keys(ACCOUNTS_DATA).filter((k) => k !== this.depositorKey);

    this.log(
      `👤 Penyetor diubah menjadi [${ACCOUNTS_DATA[key].name}] (${ACCOUNTS_DATA[key].shortAddr}). 4 Penerima otomatis: [${this.recipientKeys.map((k) => ACCOUNTS_DATA[k].name).join(", ")}].`,
      "normal"
    );

    this.updateDynamicUI();
    await this.syncConfigToBackend();
  }

  async setDenomination(eth: number) {
    if (eth < 0.04) eth = 0.04;
    this.vaultDenomination = eth;

    const splitEth = (eth / 4).toFixed(4);
    this.log(
      `💰 Setoran brankas diubah menjadi [${eth.toFixed(2)} ETH]. Masing-masing penerima akan menerima [${splitEth} ETH].`,
      "normal"
    );

    this.updateDynamicUI();
    await this.syncConfigToBackend();
  }

  async syncConfigToBackend() {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositor: this.depositorKey,
          recipients: this.recipientKeys,
          denominationEth: this.vaultDenomination.toFixed(2),
        }),
      });
      const data = await res.json();
      if (data.success) {
        this.log(`⚡ Konfigurasi smart contract & bridge tersinkronisasi: Vault Denomination = ${data.config.denominationEth} ETH.`, "success");
      }
    } catch (err: any) {
      console.error("Failed to sync config:", err);
    }
  }

  updateDynamicUI() {
    const dep = ACCOUNTS_DATA[this.depositorKey];
    const splitEth = (this.vaultDenomination / 4).toFixed(4);

    // 1. Setup Bar
    const selectDepositor = document.getElementById("select-depositor") as HTMLSelectElement;
    if (selectDepositor && selectDepositor.value !== this.depositorKey) {
      selectDepositor.value = this.depositorKey;
    }

    const tagContainer = document.getElementById("receivers-tags-container");
    if (tagContainer) {
      tagContainer.innerHTML = this.recipientKeys
        .map((k, idx) => `<span class="receiver-tag" id="tag-rec-${idx}">${ACCOUNTS_DATA[k].name}</span>`)
        .join("");
    }

    const presetPills = document.querySelectorAll("#preset-pills .preset-pill");
    presetPills.forEach((pill) => {
      const pEth = parseFloat(pill.getAttribute("data-eth") || "0");
      pill.classList.toggle("active", Math.abs(pEth - this.vaultDenomination) < 0.001);
    });

    const customInput = document.getElementById("input-custom-eth") as HTMLInputElement;
    if (customInput && document.activeElement !== customInput) {
      customInput.value = this.vaultDenomination.toFixed(1);
    }

    const calcBadge = document.getElementById("calc-split-badge");
    if (calcBadge) calcBadge.innerText = `${splitEth} ETH`;

    // 2. Node 1 (Depositor)
    const titleDepositor = document.getElementById("node-depositor-title");
    if (titleDepositor) titleDepositor.innerText = `1. ${dep.name} (Penyetor Rahasia)`;

    const valAddr = document.getElementById("val-alice-address");
    if (valAddr) valAddr.innerText = dep.shortAddr;

    const labelBal = document.getElementById("label-depositor-balance");
    if (labelBal) labelBal.innerText = `Saldo ${dep.name}:`;

    const valBal = document.getElementById("val-alice-balance");
    if (valBal) {
      const bal = this.accountBalances[this.depositorKey] || 10000.0;
      valBal.innerText = `${bal.toFixed(4)} ETH`;
    }

    const portDepLabel = document.getElementById("port-depositor-label");
    if (portDepLabel) {
      portDepLabel.innerText = `Deposit Commitment & ${this.vaultDenomination.toFixed(2)} ETH`;
    }

    // 3. Node 2 (Vault)
    const valVaultBal = document.getElementById("val-vault-balance");
    if (valVaultBal) {
      valVaultBal.innerText = `${this.vaultBalance.toFixed(4)} ETH`;
      if (this.vaultBalance > 0.0001) {
        valVaultBal.classList.add("text-success");
      } else {
        valVaultBal.classList.remove("text-success");
      }
    }

    const valVaultDenom = document.getElementById("val-vault-denomination");
    if (valVaultDenom) {
      valVaultDenom.innerText = `${this.vaultDenomination.toFixed(2)} ETH (${splitEth} ETH / dompet)`;
    }

    const valVaultAddr = document.getElementById("val-vault-address");
    if (valVaultAddr && this.vaultAddress) {
      valVaultAddr.innerText = `${this.vaultAddress.slice(0, 6)}...${this.vaultAddress.slice(-4)} (EVM)`;
    }

    // 4. Node 4 (Relayer)
    const portRelayerLabel = document.getElementById("port-relayer-label");
    if (portRelayerLabel) {
      portRelayerLabel.innerText = `Pencairan Terbagi (4x ${splitEth} ETH)`;
    }

    // 5. Node 5 (Recipients Grid)
    const recipientsGrid = document.getElementById("recipients-grid");
    if (recipientsGrid) {
      recipientsGrid.innerHTML = this.recipientKeys
        .map((k, idx) => {
          const acc = ACCOUNTS_DATA[k];
          const bal = (this.accountBalances[k] || 10000.0).toFixed(4);
          return `
            <div class="recipient-item" id="rec-item-${idx}" data-rec-index="${idx}">
              <div class="rec-name" id="rec-name-${idx}">${acc.name}</div>
              <div class="rec-address" id="rec-addr-${idx}">${acc.shortAddr}</div>
              <div class="rec-balance" id="rec-bal-${idx}">${bal} ETH</div>
              <div class="rec-target-badge" id="rec-target-${idx}">+${splitEth} ETH</div>
            </div>
          `;
        })
        .join("");
    }

    // 6. Update Inspector Database
    this.refreshInspectorDatabase();
    if (this.selectedNodeId) {
      this.selectNode(this.selectedNodeId);
    }
  }

  refreshInspectorDatabase() {
    const dep = ACCOUNTS_DATA[this.depositorKey];
    const splitEth = (this.vaultDenomination / 4).toFixed(4);

    this.nodeDatabase.alice = {
      id: "alice",
      name: `1. ${dep.name} (Penyetor Rahasia)`,
      type: "Depositor / Preimage Generator",
      description: `${dep.name} membuat 2 angka rahasia besar (secret & nullifier) berukuran 254-bit di komputernya. Identitas dompetnya hanya tercatat saat menyetor dana ke brankas, tidak pernah tercatat saat pencairan.`,
      fields: {
        "Nama Penyetor": dep.name,
        "Alamat Dompet": dep.address,
        "Saldo Terkini": `${(this.accountBalances[this.depositorKey] || 10000.0).toFixed(4)} ETH`,
        "Private Secret": this.currentSecretHex,
        "Private Nullifier": this.currentNullifierHex,
        "Commitment Hash": this.currentCommitmentHex,
        "Ukuran Setoran": `${this.vaultDenomination.toFixed(2)} ETH per putaran`,
      },
    };

    this.nodeDatabase.vault.fields["Alamat Kontrak"] = this.vaultAddress;
    this.nodeDatabase.vault.fields["Saldo Brankas"] = `${this.vaultBalance.toFixed(4)} ETH`;
    this.nodeDatabase.vault.fields["Ukuran Denominasi"] = `${this.vaultDenomination.toFixed(2)} ETH (Dinamis)`;

    this.nodeDatabase.prover.fields["Binding 4 Penerima"] = this.recipientKeys.map((k) => ACCOUNTS_DATA[k].name).join(", ");

    const recipientFields: Record<string, string> = {};
    this.recipientKeys.forEach((k, idx) => {
      const acc = ACCOUNTS_DATA[k];
      const bal = (this.accountBalances[k] || 10000.0).toFixed(4);
      recipientFields[`Penerima ${idx + 1} (${acc.name})`] = `${acc.shortAddr} (${bal} ETH)`;
    });
    recipientFields["Total Diterima"] = `${this.vaultDenomination.toFixed(4)} ETH (${splitEth} ETH x 4)`;
    recipientFields["Sumber Pengirim"] = "ZKVault (Bukan Penyetor)";

    this.nodeDatabase.recipients.fields = recipientFields;
  }

  async fetchBlockchainStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("API not reachable");
      const data = await res.json();

      if (data.connected) {
        const badge = document.getElementById("network-badge");
        const statusText = document.getElementById("network-status-text");
        if (badge) badge.classList.remove("disconnected");
        if (statusText) {
          statusText.innerText = `🟢 Hardhat Node (Port 8545) | Block #${data.blockNumber} | Gas: ${data.gasPriceGwei} Gwei`;
        }

        // Live balances directly from EVM
        if (data.balances) {
          if (data.balances.alice) this.accountBalances.alice = parseFloat(data.balances.alice);
          if (data.balances.bob) this.accountBalances.bob = parseFloat(data.balances.bob);
          if (data.balances.charlie) this.accountBalances.charlie = parseFloat(data.balances.charlie);
          if (data.balances.dave) this.accountBalances.dave = parseFloat(data.balances.dave);
          if (data.balances.eve) this.accountBalances.eve = parseFloat(data.balances.eve);
          if (data.balances.vault) this.vaultBalance = parseFloat(data.balances.vault);
          if (data.balances.relayer) this.relayerBalance = parseFloat(data.balances.relayer);
        }

        if (data.vaultAddress) {
          this.vaultAddress = data.vaultAddress;
        }

        if (data.currentRoot) {
          const valRoot = document.getElementById("val-merkle-root");
          if (valRoot) valRoot.innerText = `${data.currentRoot.slice(0, 8)}...`;
        }

        const valVaultTree = document.getElementById("val-vault-tree");
        if (valVaultTree) {
          valVaultTree.innerText = `Depth: 8 | Daun: ${data.treeLeafCount || 0} / 256`;
        }

        this.updateDynamicUI();
      }
    } catch {
      const badge = document.getElementById("network-badge");
      const statusText = document.getElementById("network-status-text");
      if (badge) badge.classList.add("disconnected");
      if (statusText) statusText.innerText = "⚠️ Node Offline (127.0.0.1:8545)";
    }
  }

  initEvents() {
    // 1. Mouse Wheel Zoom & Trackpad Pinch / Pan
    this.canvas.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey) {
          const zoomFactor = -e.deltaY * 0.005;
          this.zoom(zoomFactor);
          return;
        }

        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
          this.panX -= e.deltaX;
          this.panY -= e.deltaY;
          this.applyTransform();
          this.updateAllCables();
          this.drawMinimap();
          return;
        }

        const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const prevZoom = this.zoomLevel;
        const nextZoom = Math.min(2.5, Math.max(0.35, prevZoom + zoomDelta));

        this.panX = mouseX - ((mouseX - this.panX) / prevZoom) * nextZoom;
        this.panY = mouseY - ((mouseY - this.panY) / prevZoom) * nextZoom;
        this.zoomLevel = nextZoom;

        const zoomText = document.getElementById("val-zoom");
        if (zoomText) zoomText.innerText = `${Math.round(this.zoomLevel * 100)}%`;

        this.applyTransform();
        this.updateAllCables();
        this.drawMinimap();
      },
      { passive: false }
    );

    // 2. Drag & Drop for Node Cards
    const nodeCards = document.querySelectorAll(".node-card");
    nodeCards.forEach((card) => {
      const htmlCard = card as HTMLElement;
      const header = htmlCard.querySelector(".node-header") as HTMLElement;

      header?.addEventListener("mousedown", (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        this.selectNode(htmlCard.getAttribute("data-node-id") || "alice");

        this.activeDragNode = htmlCard;
        const cardX = parseFloat(htmlCard.style.left || "0");
        const cardY = parseFloat(htmlCard.style.top || "0");

        this.dragOffsetX = e.clientX / this.zoomLevel - cardX;
        this.dragOffsetY = e.clientY / this.zoomLevel - cardY;

        htmlCard.style.zIndex = "50";
      });

      htmlCard.addEventListener("click", () => {
        this.selectNode(htmlCard.getAttribute("data-node-id") || "alice");
        if (!this.isRunning) {
          this.switchToPanelTab("inspector-receipt");
        }
      });
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.activeDragNode) {
        const newX = e.clientX / this.zoomLevel - this.dragOffsetX;
        const newY = e.clientY / this.zoomLevel - this.dragOffsetY;

        this.activeDragNode.style.left = `${Math.max(10, newX)}px`;
        this.activeDragNode.style.top = `${Math.max(10, newY)}px`;

        this.updateAllCables();
        this.drawMinimap();
      } else if (this.isDraftingCable && this.draftSourcePort && this.cableDraftEl) {
        const sourceCenter = this.getPortCenter(this.draftSourcePort.id);
        const canvasRect = this.canvas.getBoundingClientRect();
        const mouseCanvasPos: NodePos = {
          x: e.clientX - canvasRect.left,
          y: e.clientY - canvasRect.top,
        };

        const p1 = this.draftSourceDir === "out" ? sourceCenter : mouseCanvasPos;
        const p2 = this.draftSourceDir === "out" ? mouseCanvasPos : sourceCenter;

        this.cableDraftEl.setAttribute("d", this.createBezierPath(p1, p2));

        const elemUnder = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const portTarget = elemUnder?.closest(".port") as HTMLElement | null;

        if (portTarget && portTarget !== this.draftSourcePort) {
          this.currentHoveredTarget = portTarget;
          const validation = this.validateConnection(this.draftSourcePort, portTarget);

          document.querySelectorAll(".port").forEach((p) => p.classList.remove("valid-target", "invalid-target"));

          if (validation.valid) {
            portTarget.classList.add("valid-target");
            this.cableDraftEl.classList.remove("invalid");
            this.showTooltip(e.clientX, e.clientY, validation.message, true);
          } else {
            portTarget.classList.add("invalid-target");
            this.cableDraftEl.classList.add("invalid");
            this.showTooltip(e.clientX, e.clientY, validation.message, false);
          }
        } else {
          this.currentHoveredTarget = null;
          document.querySelectorAll(".port").forEach((p) => p.classList.remove("valid-target", "invalid-target"));
          this.cableDraftEl.classList.remove("invalid");
          this.hideTooltip();
        }
      } else if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.applyTransform();
        this.updateAllCables();
        this.drawMinimap();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.activeDragNode) {
        this.activeDragNode.style.zIndex = "10";
        this.activeDragNode = null;
      }
      if (this.isDraftingCable) {
        if (this.currentHoveredTarget && this.draftSourcePort) {
          const validation = this.validateConnection(this.draftSourcePort, this.currentHoveredTarget);
          if (validation.valid) {
            const sourceDir = this.draftSourcePort.getAttribute("data-port-dir");
            const outId = sourceDir === "out" ? this.draftSourcePort.id : this.currentHoveredTarget.id;
            const inId = sourceDir === "out" ? this.currentHoveredTarget.id : this.draftSourcePort.id;

            this.activeConnections[outId] = inId;
            this.log(`🔗 KABEL TERPASANG: [${this.portMeta[outId]?.label || outId}] ➔ [${this.portMeta[inId]?.label || inId}]`, "success");
            this.updateAllCables();
          } else {
            this.log(`${validation.message}`, "error");
            const targetCard = this.currentHoveredTarget.closest(".node-card");
            targetCard?.classList.add("node-shake");
            setTimeout(() => targetCard?.classList.remove("node-shake"), 600);
            this.updateAllCables();
          }
        } else if (this.draftSourcePort) {
          this.log(`🔌 Kabel dilepas di area bebas (unplugged).`, "normal");
          this.updateAllCables();
        }
        this.stopDrafting();
      }
      if (this.isPanning) {
        this.isPanning = false;
        document.body.classList.remove("panning-active");
        this.canvas.classList.remove("panning");
      }
    });

    // 3. Canvas Panning
    const handlePanStart = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isCard = !!target.closest(".node-card");
      const isPort = !!target.closest(".port");
      const isInteractive = !!target.closest(
        "button, .tool-btn, .action-card-btn, #right-panel, .drawer-handle, .cyber-badge, .user-profile, select, input, .dynamic-setup-bar"
      );

      const isMiddleClick = e.button === 1;
      const isLeftClick = e.button === 0 && !isCard && !isPort && !isInteractive;
      const isSpaceDrag = (this.isSpacePressed || this.isPanToolActive) && e.button === 0 && !isInteractive;

      if (isMiddleClick || isLeftClick || isSpaceDrag) {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
        document.body.classList.add("panning-active");
        this.canvas.classList.add("panning");
        e.preventDefault();
      }
    };

    this.canvas.addEventListener("mousedown", handlePanStart);

    this.canvas.addEventListener("contextmenu", (e) => {
      if (this.isPanning || e.button === 1) e.preventDefault();
    });

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "Space" && !this.isSpacePressed && !(e.target as HTMLElement)?.matches("input, textarea, select")) {
        this.isSpacePressed = true;
        this.canvas.classList.add("space-pressed");
      }
    });

    window.addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        if (!this.isPanToolActive) {
          this.canvas.classList.remove("space-pressed");
        }
      }
    });

    // 4. Zoom & Pan Buttons
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.zoom(0.1));
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.zoom(-0.1));
    document.getElementById("btn-zoom-fit")?.addEventListener("click", () => this.resetView());
    document.getElementById("btn-center-graph")?.addEventListener("click", () => this.resetView());

    // Hand Pan Tool toggle on left toolbar
    const btnPan = document.getElementById("btn-pan-tool");
    btnPan?.addEventListener("click", () => {
      this.isPanToolActive = !this.isPanToolActive;
      btnPan.classList.toggle("pan-active", this.isPanToolActive);
      this.canvas.classList.toggle("space-pressed", this.isPanToolActive);
      if (this.isPanToolActive) {
        this.log("🖐️ Mode Hand Pan diaktifkan: Klik & seret di area mana pun untuk menggeser kanvas.", "normal");
      } else {
        this.log("🖱️ Mode Kursor Standar diaktifkan.", "normal");
      }
    });

    // 5. Drawer Toggle Handle
    const toggleDrawer = () => {
      this.rightPanel.classList.toggle("collapsed");
      const isCollapsed = this.rightPanel.classList.contains("collapsed");
      this.drawerArrow.innerText = isCollapsed ? "‹" : "›";
      setTimeout(() => {
        this.updateAllCables();
        this.drawMinimap();
      }, 300);
    };

    this.drawerToggleBtn?.addEventListener("click", toggleDrawer);
    document.getElementById("btn-close-panel")?.addEventListener("click", toggleDrawer);
    document.getElementById("btn-toggle-panel")?.addEventListener("click", toggleDrawer);

    // 6. Scenario Selection in Right Panel
    const actionBtns = document.querySelectorAll(".action-card-btn");
    const btnToggleScenarios = document.getElementById("btn-toggle-scenarios");
    const quickActionsExpandable = document.getElementById("quick-actions-expandable");
    const scenarioExpandIcon = document.getElementById("scenario-expand-icon");
    const scenarioExpandLabel = document.getElementById("scenario-expand-label");

    btnToggleScenarios?.addEventListener("click", () => {
      if (!quickActionsExpandable) return;
      const isHidden = quickActionsExpandable.hidden;
      quickActionsExpandable.hidden = !isHidden;
      if (scenarioExpandIcon) scenarioExpandIcon.textContent = isHidden ? "▴" : "▾";
      if (scenarioExpandLabel) scenarioExpandLabel.textContent = isHidden ? "Sembunyikan Pilihan Skenario" : "Ganti Skenario Eksperimen (3 Opsi)";
      btnToggleScenarios.classList.toggle("active", Boolean(isHidden));
    });

    actionBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        actionBtns.forEach((b) => b.classList.remove("active-action"));
        btn.classList.add("active-action");

        const scenario = btn.getAttribute("data-scenario") as "normal" | "hijack" | "doublespend";
        this.setScenario(scenario);

        // Ciutkan kembali pilihan setelah skenario dipilih agar tetap bersih
        if (quickActionsExpandable) quickActionsExpandable.hidden = true;
        if (scenarioExpandIcon) scenarioExpandIcon.textContent = "▾";
        if (scenarioExpandLabel) scenarioExpandLabel.textContent = "Ganti Skenario Eksperimen (3 Opsi)";
        btnToggleScenarios?.classList.remove("active");
      });
    });

    // 7. Interactive Zero-Knowledge Guide Modal (?)
    const guideModalBackdrop = document.getElementById("modal-guide-backdrop");
    const openGuideModal = () => {
      guideModalBackdrop?.classList.add("open");
    };
    const closeGuideModal = () => {
      guideModalBackdrop?.classList.remove("open");
    };

    document.getElementById("btn-info")?.addEventListener("click", openGuideModal);
    document.getElementById("btn-close-modal")?.addEventListener("click", closeGuideModal);
    document.getElementById("btn-modal-gotit")?.addEventListener("click", closeGuideModal);

    guideModalBackdrop?.addEventListener("click", (e) => {
      if (e.target === guideModalBackdrop) {
        closeGuideModal();
      }
    });

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && guideModalBackdrop?.classList.contains("open")) {
        closeGuideModal();
      }
    });

    // 8. Execution Controls
    document.getElementById("btn-run-workflow")?.addEventListener("click", () => this.runSelectedScenario());
    document.getElementById("btn-reset-workflow")?.addEventListener("click", () => this.resetSimulation());
    document.getElementById("btn-auto-wire")?.addEventListener("click", () => this.autoWire());

    window.addEventListener("resize", () => {
      this.updateAllCables();
      this.drawMinimap();
    });
  }

  // ==========================================================================
  // FORENSIC INVESTIGATOR AUDIT LOGIC (DE-ANONYMIZATION)
  // ==========================================================================
  lastForensicReport: any = null;

  setupForensicModal() {
    const forensicBackdrop = document.getElementById("modal-forensic-backdrop");
    const openForensicModal = () => {
      forensicBackdrop?.classList.add("open");
      this.resetForensicView();
      this.fetchWithdrawHistory();
    };
    const closeForensicModal = () => {
      forensicBackdrop?.classList.remove("open");
    };

    document.getElementById("btn-open-forensic")?.addEventListener("click", openForensicModal);
    document.getElementById("btn-forensic-tool")?.addEventListener("click", openForensicModal);
    document.getElementById("btn-close-forensic")?.addEventListener("click", closeForensicModal);
    document.getElementById("btn-close-forensic-bottom")?.addEventListener("click", closeForensicModal);
    document.getElementById("btn-run-audit-now")?.addEventListener("click", () => this.runForensicScan());
    document.getElementById("btn-clear-forensic")?.addEventListener("click", () => {
      this.resetForensicView();
      this.showToast("🧹 Tampilan audit dibersihkan.");
    });
    document.getElementById("btn-scan-custom-tx")?.addEventListener("click", () => {
      const input = document.getElementById("input-forensic-tx") as HTMLInputElement;
      this.runForensicScan(input?.value.trim());
    });

    document.getElementById("btn-export-report")?.addEventListener("click", () => this.copyForensicReport());

    forensicBackdrop?.addEventListener("click", (e) => {
      if (e.target === forensicBackdrop) closeForensicModal();
    });

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && forensicBackdrop?.classList.contains("open")) {
        closeForensicModal();
      }
    });
  }

  openForensicModalForTx(txHash?: string) {
    const modal = document.getElementById("modal-forensic-backdrop");
    modal?.classList.add("open");
    this.resetForensicView();
    this.fetchWithdrawHistory();

    if (txHash) {
      const input = document.getElementById("input-forensic-tx") as HTMLInputElement;
      if (input) input.value = txHash;
      const targetBadge = document.getElementById("forensic-target-badge");
      if (targetBadge) {
        targetBadge.textContent = "TX SIAP DIAUDIT";
      }

      const empty = document.getElementById("forensic-empty-state");
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = `
          <div class="empty-icon">🎯</div>
          <h4>Transaksi Siap Di-Audit</h4>
          <p class="empty-tx-hash-preview"><code>${txHash}</code></p>
          <p>Hash penarikan telah dimasukkan ke input di atas. Klik <strong>"Audit Custom Tx"</strong> atau tekan tombol di bawah untuk memulai de-anonimisasi.</p>
          <button class="forensic-action-btn start-audit-cta-btn" id="btn-start-audit-cta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Mulai Analisa Forensik Sekarang</span>
          </button>
        `;
        document.getElementById("btn-start-audit-cta")?.addEventListener("click", () => {
          this.runForensicScan(txHash);
        });
      }
    }
  }

  setForensicResultsVisible(visible: boolean) {
    const results = document.getElementById("forensic-results");
    const empty = document.getElementById("forensic-empty-state");
    const loading = document.getElementById("forensic-loading-state");
    if (loading) loading.hidden = true;
    if (results) results.hidden = !visible;
    if (empty) empty.hidden = visible;
  }

  resetForensicView() {
    this.lastForensicReport = null;
    const results = document.getElementById("forensic-results");
    const empty = document.getElementById("forensic-empty-state");
    const loading = document.getElementById("forensic-loading-state");
    if (results) results.hidden = true;
    if (loading) loading.hidden = true;
    if (empty) {
      empty.hidden = false;
      empty.innerHTML = `
        <div class="empty-icon">🕵️</div>
        <h4>Belum ada transaksi yang diaudit</h4>
        <p>Pilih transaksi dari riwayat di atas, tempel hash kustom, atau tekan <strong>Scan On-Chain</strong> untuk mengaudit penarikan terbaru. Hasil akan tampil di sini.</p>
      `;
    }
    const input = document.getElementById("input-forensic-tx") as HTMLInputElement;
    if (input) input.value = "";
    const select = document.getElementById("select-forensic-history") as HTMLSelectElement;
    if (select) select.value = "";
    const caseBadge = document.getElementById("forensic-case-badge");
    if (caseBadge) caseBadge.textContent = "CASE #INV-READY";
    const targetBadge = document.getElementById("forensic-target-badge");
    if (targetBadge) targetBadge.textContent = "BELUM ADA AUDIT";
    const tbody = document.getElementById("candidates-table-body");
    if (tbody) tbody.innerHTML = "";

    // Reset kartu tersangka & payout ke mode tersamar (blurred & placeholder)
    const suspectBody = document.getElementById("f-suspect-body");
    const payoutBody = document.getElementById("f-payout-body");
    if (suspectBody) {
      suspectBody.classList.remove("revealed");
      suspectBody.classList.add("blurred");
    }
    if (payoutBody) {
      payoutBody.classList.remove("revealed");
      payoutBody.classList.add("blurred");
    }

    const suspectAddr = document.getElementById("f-suspect-address");
    const suspectConf = document.getElementById("f-suspect-confidence");
    const suspectProgress = document.getElementById("f-suspect-progress");
    const suspectSummary = document.getElementById("f-suspect-summary");
    if (suspectAddr) suspectAddr.textContent = "— (Belum Dianalisis)";
    if (suspectConf) {
      suspectConf.textContent = "⚪ MENUNGGU HASIL";
      suspectConf.className = "confidence-badge-pill badge-neutral";
    }
    if (suspectProgress) suspectProgress.style.width = "0%";
    if (suspectSummary) suspectSummary.textContent = "Identitas tersangka utama akan diungkap setelah evaluasi 5 pilar forensik selesai.";

    const totalAmount = document.getElementById("f-total-amount");
    const splitDetail = document.getElementById("f-split-detail");
    const relayerInfo = document.getElementById("f-relayer-info");
    const payoutTag = document.getElementById("f-payout-tag");
    if (totalAmount) totalAmount.textContent = "— ETH";
    if (splitDetail) splitDetail.textContent = "@ — ETH per dompet penerima";
    if (relayerInfo) relayerInfo.textContent = "Kurir: —";
    if (payoutTag) payoutTag.textContent = "— Penerima";

    const kVal = document.getElementById("f-k-value");
    const kStatus = document.getElementById("f-k-status");
    const kDesc = document.getElementById("f-k-desc");
    if (kVal) kVal.textContent = "k = —";
    if (kStatus) {
      kStatus.textContent = "⚪ MENUNGGU SCAN";
      kStatus.className = "f-k-status";
    }
    if (kDesc) kDesc.textContent = "Ukuran anonymity set akan dihitung dari jumlah daun deposit pada pohon Merkle sebelum penarikan.";

    // Reset status kartu langkah audit dan progress bar ke posisi netral
    for (let i = 1; i <= 5; i++) {
      const card = document.getElementById(`f-step-${i}`);
      const tag = document.getElementById(`f-step-tag-${i}`);
      if (card) card.className = "step-card";
      if (tag) tag.textContent = "Menunggu";
    }
    const bar = document.getElementById("forensic-progress-bar");
    const pctText = document.getElementById("forensic-progress-pct");
    const statusText = document.getElementById("forensic-progress-status");
    if (bar) bar.style.width = "0%";
    if (pctText) pctText.textContent = "0%";
    if (statusText) statusText.textContent = "Menunggu analisis dimulai...";
  }

  // ==========================================================================
  // COLLAPSIBLE SEGMENTS (ZK PRIVACY AGENT PANEL)
  // ==========================================================================
  setupPanelSegments() {
    document.querySelectorAll<HTMLElement>(".panel-section:not(#seg-scenario)").forEach((section) => {
      const header = section.querySelector<HTMLElement>(":scope > .seg-header");
      header?.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest("button");
        if (btn && !btn.classList.contains("seg-toggle")) return; // tombol lain (Clear) tidak memicu toggle
        section.classList.toggle("collapsed");
      });
    });

    document.getElementById("btn-clear-log")?.addEventListener("click", () => {
      const stream = document.getElementById("log-stream");
      if (!stream) return;
      stream.innerHTML = `<div class="log-entry"><span class="log-time">[Clear]</span><span class="log-msg">Log dibersihkan.</span></div>`;
    });
  }

  // ==========================================================================
  // PANEL TAB CONTROLLER (SKENARIO & LOG vs INSPEKTOR & BUKTI TX)
  // ==========================================================================
  switchToPanelTab(tab: "scenario-log" | "inspector-receipt") {
    const btnScenarioLog = document.getElementById("tab-btn-scenario-log");
    const btnInspectorReceipt = document.getElementById("tab-btn-inspector-receipt");
    const paneScenarioLog = document.getElementById("pane-scenario-log");
    const paneInspectorReceipt = document.getElementById("pane-inspector-receipt");

    const isScenario = tab === "scenario-log";

    btnScenarioLog?.classList.toggle("active", isScenario);
    btnScenarioLog?.setAttribute("aria-selected", isScenario ? "true" : "false");

    btnInspectorReceipt?.classList.toggle("active", !isScenario);
    btnInspectorReceipt?.setAttribute("aria-selected", !isScenario ? "true" : "false");

    if (paneScenarioLog) {
      paneScenarioLog.hidden = !isScenario;
      paneScenarioLog.classList.toggle("active", isScenario);
    }
    if (paneInspectorReceipt) {
      paneInspectorReceipt.hidden = isScenario;
      paneInspectorReceipt.classList.toggle("active", !isScenario);
    }
  }

  setupPanelTabs() {
    const btnScenarioLog = document.getElementById("tab-btn-scenario-log");
    const btnInspectorReceipt = document.getElementById("tab-btn-inspector-receipt");

    btnScenarioLog?.addEventListener("click", () => this.switchToPanelTab("scenario-log"));
    btnInspectorReceipt?.addEventListener("click", () => this.switchToPanelTab("inspector-receipt"));
  }

  async runForensicScan(customTxHash?: string) {
    const empty = document.getElementById("forensic-empty-state");
    const results = document.getElementById("forensic-results");
    const loading = document.getElementById("forensic-loading-state");
    const statusTag = document.getElementById("forensic-target-badge");

    // Sembunyikan hasil & tampilan kosong, tampilkan loading state interaktif
    if (empty) empty.hidden = true;
    if (results) results.hidden = true;
    if (loading) loading.hidden = false;
    if (statusTag) statusTag.textContent = "SEDANG MENGANALISA...";

    const updateStep = (stepNum: number, pct: number, label: string) => {
      const bar = document.getElementById("forensic-progress-bar");
      const pctText = document.getElementById("forensic-progress-pct");
      const statusText = document.getElementById("forensic-progress-status");
      if (bar) bar.style.width = `${pct}%`;
      if (pctText) pctText.textContent = `${pct}%`;
      if (statusText) statusText.textContent = label;

      for (let i = 1; i <= 5; i++) {
        const card = document.getElementById(`f-step-${i}`);
        const tag = document.getElementById(`f-step-tag-${i}`);
        if (!card || !tag) continue;
        if (i < stepNum) {
          card.className = "step-card completed";
          tag.textContent = "✓ Selesai";
        } else if (i === stepNum) {
          card.className = "step-card active";
          tag.textContent = "Sedang Memproses...";
        } else {
          card.className = "step-card";
          tag.textContent = "Menunggu";
        }
      }
    };

    updateStep(1, 15, "Langkah 1/5: Mengambil Nullifier & log event ZKVault...");

    const targetTx = customTxHash || (document.getElementById("input-forensic-tx") as HTMLInputElement)?.value.trim() || undefined;
    const url = targetTx 
      ? `http://127.0.0.1:3001/api/investigate?txHash=${encodeURIComponent(targetTx)}`
      : `http://127.0.0.1:3001/api/investigate`;

    const fetchPromise = fetch(url).then(async (res) => {
      const data = await res.json();
      if (!data.success || !data.report) {
        throw new Error(data.error || "Gagal memproses audit forensik");
      }
      return data.report;
    });

    try {
      await new Promise((r) => setTimeout(r, 260));
      updateStep(2, 40, "Langkah 2/5: Merekontruksi Pohon Merkle ($k$-Anonymity)...");

      await new Promise((r) => setTimeout(r, 280));
      updateStep(3, 65, "Langkah 3/5: Mengkorelasikan waktu setoran & denominasi...");

      await new Promise((r) => setTimeout(r, 280));
      updateStep(4, 85, "Langkah 4/5: Memeriksa jejak gas & heuristik jaringan...");

      const report = await fetchPromise;

      await new Promise((r) => setTimeout(r, 260));
      updateStep(5, 92, "Langkah 5/5: Menyusun matriks skor & menetapkan tersangka...");

      await new Promise((r) => setTimeout(r, 350));
      // Tuntaskan langkah 5 (dan seluruh 5 langkah) menjadi ✓ Selesai
      updateStep(6, 100, "✓ Audit forensik selesai: 5/5 pilar terverifikasi!");

      await new Promise((r) => setTimeout(r, 450));

      if (loading) loading.hidden = true;
      if (results) results.hidden = false;

      this.lastForensicReport = report;
      this.renderForensicReport(report);
      this.showToast("🕵️ Laporan audit forensik selesai dianalisis!");
    } catch (err: any) {
      console.error("Forensic scan error:", err);
      if (loading) loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = `
          <div class="empty-icon" style="color: #ef4444;">⚠️</div>
          <h4 style="color: #b91c1c;">Gagal Menganalisa Transaksi</h4>
          <p style="color: #475569;">${err.message || "Pastikan ada transaksi penarikan (withdrawSplit) yang valid pada blockchain."}</p>
          <button class="forensic-action-btn" id="btn-retry-audit" style="margin-top: 10px;">
            <span>🔄 Coba Lagi</span>
          </button>
        `;
        document.getElementById("btn-retry-audit")?.addEventListener("click", () => {
          this.runForensicScan(targetTx);
        });
      }
      if (statusTag) statusTag.textContent = "GAGAL";
      this.showToast(`❌ Gagal audit: ${err.message}`);
    }
  }

  renderForensicReport(report: any) {
    // 1. Header Badges
    const caseBadge = document.getElementById("forensic-case-badge");
    if (caseBadge) caseBadge.textContent = `CASE #${report.investigationId}`;

    const targetBadge = document.getElementById("forensic-target-badge");
    if (targetBadge) {
      targetBadge.textContent = `Tx: ${report.withdrawTxHash.slice(0, 10)}... (Blok #${report.withdrawBlock})`;
    }

    // 2. Anonymity Set Meter
    const kVal = document.getElementById("f-k-value");
    const kStatus = document.getElementById("f-k-status");
    const kDesc = document.getElementById("f-k-desc");
    if (kVal) kVal.textContent = `k = ${report.anonymitySetSize}`;
    if (kStatus && kDesc) {
      if (report.anonymitySetSize === 1) {
        kStatus.textContent = "⚠️ ANONYMITY COLLAPSE (100% PASTI)";
        kStatus.className = "f-k-status status-collapse";
        kDesc.textContent = "Hanya 1 setoran yang pernah tercatat sebelum root ini dibuat. De-anonimisasi 100% deterministik!";
      } else if (report.anonymitySetSize <= 3) {
        kStatus.textContent = "🟡 ANONYMITY RENDAH (POOL SEMPIT)";
        kStatus.className = "f-k-status status-warning";
        kDesc.textContent = `Terdapat ${report.anonymitySetSize} setoran bersaing. Peluang tersangka utama sangat dominan.`;
      } else {
        kStatus.textContent = "⚪ ANONYMITY SET SEDANG";
        kStatus.className = "f-k-status";
        kDesc.textContent = `Terdapat ${report.anonymitySetSize} setoran dalam pool. Diperlukan pilar korelasi tambahan.`;
      }
    }

    // 3. Prime Suspect & Payout Details (Unblur & Reveal)
    const suspectBody = document.getElementById("f-suspect-body");
    const payoutBody = document.getElementById("f-payout-body");
    if (suspectBody) {
      suspectBody.classList.remove("blurred");
      suspectBody.classList.add("revealed");
    }
    if (payoutBody) {
      payoutBody.classList.remove("blurred");
      payoutBody.classList.add("revealed");
    }
    const payoutTag = document.getElementById("f-payout-tag");
    if (payoutTag) payoutTag.textContent = "4 Penerima";

    const suspectAddr = document.getElementById("f-suspect-address");
    const suspectConf = document.getElementById("f-suspect-confidence");
    const suspectProgress = document.getElementById("f-suspect-progress");
    const suspectSummary = document.getElementById("f-suspect-summary");

    if (report.primeSuspect) {
      const matchedAccount = Object.values(ACCOUNTS_DATA).find(
        (a) => a.address.toLowerCase() === report.primeSuspect.depositorAddress.toLowerCase()
      );
      const nameTag = matchedAccount ? ` (${matchedAccount.name})` : "";
      if (suspectAddr) suspectAddr.textContent = `${report.primeSuspect.depositorAddress.slice(0, 10)}...${report.primeSuspect.depositorAddress.slice(-4)}${nameTag}`;
      
      if (suspectConf) {
        suspectConf.textContent = `${report.primeSuspect.confidence === "HIGH" ? "🔴 HIGH" : report.primeSuspect.confidence === "MEDIUM" ? "🟡 MEDIUM" : "⚪ LOW"} CONFIDENCE (${report.primeSuspect.score}%)`;
        suspectConf.className = `confidence-badge-pill ${report.primeSuspect.confidence === "HIGH" ? "badge-high" : report.primeSuspect.confidence === "MEDIUM" ? "badge-medium" : "badge-low"}`;
      }

      if (suspectProgress) {
        suspectProgress.style.width = `${report.primeSuspect.score}%`;
        suspectProgress.className = `f-progress-bar ${report.primeSuspect.confidence === "HIGH" ? "bg-red" : "bg-yellow"}`;
      }

      if (suspectSummary) {
        suspectSummary.textContent = report.primeSuspect.findings[0] || report.executiveSummary;
      }
    }

    // 4. Payout Details
    const totalAmount = document.getElementById("f-total-amount");
    const splitDetail = document.getElementById("f-split-detail");
    const relayerInfo = document.getElementById("f-relayer-info");
    if (totalAmount) totalAmount.textContent = `${report.totalWithdrawnEth} ETH`;
    if (splitDetail) splitDetail.textContent = `@ ${report.amountPerRecipientEth} ETH ke 4 dompet penerima`;
    if (relayerInfo) relayerInfo.textContent = `Kurir: ${report.relayerAddress.slice(0, 8)}...${report.relayerAddress.slice(-4)}`;

    // 5. 5 Pillars Box
    const p1Desc = document.getElementById("p1-desc");
    if (p1Desc) p1Desc.textContent = `Merkle Root ${report.merkleRootHex.slice(0, 12)}... membatasi kandidat pada tepat ${report.anonymitySetSize} daun pertama.`;

    const p2Desc = document.getElementById("p2-desc");
    if (p2Desc) p2Desc.textContent = `Total pencairan ${report.totalWithdrawnEth} ETH cocok dengan setoran brankas.`;

    // 6. Candidates Table
    const tbody = document.getElementById("candidates-table-body");
    if (tbody && report.candidates) {
      tbody.innerHTML = report.candidates.map((c: any, idx: number) => {
        const matched = Object.values(ACCOUNTS_DATA).find(
          (a) => a.address.toLowerCase() === c.depositorAddress.toLowerCase()
        );
        const nameLabel = matched ? ` (${matched.name})` : "";
        const isSuspect = report.primeSuspect && c.depositorAddress === report.primeSuspect.depositorAddress;
        const badgeClass = c.confidence === "HIGH" ? "badge-high" : c.confidence === "MEDIUM" ? "badge-medium" : "badge-low";

        return `
          <tr class="${isSuspect ? "suspect-row" : ""}">
            <td>${idx + 1}</td>
            <td title="${c.depositorAddress}">${c.depositorAddress.slice(0, 8)}...${c.depositorAddress.slice(-4)}${nameLabel}</td>
            <td title="${c.depositTxHash}">${c.depositTxHash.slice(0, 8)}...</td>
            <td>#${c.depositBlock}</td>
            <td>${c.depositAmountEth} ETH</td>
            <td>${c.timeDeltaMinutes} mnt</td>
            <td><strong>${c.score}%</strong></td>
            <td><span class="confidence-badge-pill ${badgeClass}">${c.confidence}</span></td>
          </tr>
        `;
      }).join("");
    }
  }

  copyForensicReport() {
    if (!this.lastForensicReport) {
      this.showToast("Belum ada laporan audit yang dipindai.");
      return;
    }
    const r = this.lastForensicReport;
    const text = `=== LAPORAN BUKTI FORENSIK BLOCKCHAIN ===\nID: ${r.investigationId}\nTarget Tx: ${r.withdrawTxHash}\nAnonymity Set: k=${r.anonymitySetSize}\nTersangka Utama: ${r.primeSuspect ? r.primeSuspect.depositorAddress : "N/A"} (Keyakinan: ${r.primeSuspect ? r.primeSuspect.score : 0}%)\nRingkasan: ${r.executiveSummary}`;
    this.copyToClipboard(text, "✅ Ringkasan bukti forensik berhasil disalin ke clipboard!");
  }

  // ==========================================================================
  // ON-CHAIN RECEIPT CARD & FLOATING BANNER LOGIC
  // ==========================================================================
  setupOnChainReceiptAndBanner() {
    // 1. Permanent Receipt Card actions in Inspector Drawer
    document.getElementById("btn-copy-deposit-tx")?.addEventListener("click", () => {
      if (!this.latestDepositTxHash) {
        this.showToast("Belum ada Deposit Tx di sesi ini.");
        return;
      }
      this.copyToClipboard(this.latestDepositTxHash, "📋 Deposit Tx Hash disalin ke clipboard!");
    });

    document.getElementById("btn-copy-withdraw-tx")?.addEventListener("click", () => {
      if (!this.latestWithdrawTxHash) {
        this.showToast("Belum ada Withdraw Tx di sesi ini.");
        return;
      }
      this.copyToClipboard(this.latestWithdrawTxHash, "📋 Withdraw Tx Hash disalin ke clipboard!");
    });

    document.getElementById("btn-receipt-open-audit")?.addEventListener("click", () => {
      this.openForensicModalForTx(this.latestWithdrawTxHash);
    });

    // 2. Floating Completion Banner actions
    document.getElementById("btn-dismiss-banner")?.addEventListener("click", () => {
      document.getElementById("floating-tx-banner")?.classList.remove("show");
    });

    document.getElementById("btn-banner-copy-deposit")?.addEventListener("click", () => {
      if (this.latestDepositTxHash) {
        this.copyToClipboard(this.latestDepositTxHash, "📋 Deposit Tx Hash disalin ke clipboard!");
      }
    });

    document.getElementById("btn-banner-copy-withdraw")?.addEventListener("click", () => {
      if (this.latestWithdrawTxHash) {
        this.copyToClipboard(this.latestWithdrawTxHash, "📋 Withdraw Tx Hash disalin ke clipboard!");
      }
    });

    document.getElementById("btn-banner-audit-now")?.addEventListener("click", () => {
      document.getElementById("floating-tx-banner")?.classList.remove("show");
      this.openForensicModalForTx(this.latestWithdrawTxHash);
    });

    // 3. Dropdown Forensic History selection & refresh
    const selectHistory = document.getElementById("select-forensic-history") as HTMLSelectElement;
    selectHistory?.addEventListener("change", (e) => {
      const txHash = (e.target as HTMLSelectElement).value;
      if (txHash) {
        const input = document.getElementById("input-forensic-tx") as HTMLInputElement;
        if (input) input.value = txHash;
        const targetBadge = document.getElementById("forensic-target-badge");
        if (targetBadge) targetBadge.textContent = "TX SIAP DIAUDIT";

        const empty = document.getElementById("forensic-empty-state");
        const results = document.getElementById("forensic-results");
        if (results) results.hidden = true;
        if (empty) {
          empty.hidden = false;
          empty.innerHTML = `
            <div class="empty-icon">🎯</div>
            <h4>Transaksi Riwayat Dipilih</h4>
            <p class="empty-tx-hash-preview"><code>${txHash}</code></p>
            <p>Klik tombol <strong>"Audit Custom Tx"</strong> di atas atau tombol di bawah untuk memulai analisa forensik on-chain.</p>
            <button class="forensic-action-btn start-audit-cta-btn" id="btn-start-audit-from-select">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Mulai Analisa Forensik Sekarang</span>
            </button>
          `;
          document.getElementById("btn-start-audit-from-select")?.addEventListener("click", () => {
            this.runForensicScan(txHash);
          });
        }
      }
    });

    document.getElementById("btn-refresh-history")?.addEventListener("click", async () => {
      await this.fetchWithdrawHistory();
      this.showToast("🔄 Riwayat penarikan berhasil diperbarui!");
    });
  }

  showToast(msg: string) {
    const toast = document.getElementById("app-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  copyToClipboard(text: string, successMsg: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(successMsg);
    }).catch(() => {
      this.showToast("Gagal menyalin ke clipboard.");
    });
  }

  async fetchWithdrawHistory() {
    const select = document.getElementById("select-forensic-history") as HTMLSelectElement;
    if (!select) return;
    try {
      const res = await fetch("http://127.0.0.1:3001/api/withdraw-history");
      const payload = await res.json();
      const list = Array.isArray(payload) ? payload : payload.history;
      if (!Array.isArray(list) || list.length === 0) {
        select.innerHTML = `<option value="">Belum ada penarikan on-chain yang tercatat</option>`;
        return;
      }

      // Display up to 15 latest withdrawals descending
      const top15 = list.slice(0, 15);
      let optionsHtml = `<option value="">-- Pilih Transaksi Penarikan (${top15.length} Terbaru) --</option>`;
      top15.forEach((item: any, idx: number) => {
        const timePart = item.timeString ? ` [${item.timeString}]` : "";
        optionsHtml += `<option value="${item.txHash}">#${top15.length - idx} • Blok ${item.blockNumber} • ${item.totalWithdrawnEth} ETH${timePart} • (${item.txHash.slice(0, 10)}...)</option>`;
      });
      select.innerHTML = optionsHtml;
    } catch (e) {
      console.error("Gagal mengambil riwayat penarikan:", e);
      select.innerHTML = `<option value="">⚠️ Gagal memuat riwayat on-chain</option>`;
    }
  }

  displayOnChainReceipt(withdrawData: any) {
    // 1. Update Receipt Card in Drawer
    const statusBadge = document.getElementById("receipt-status-badge");
    if (statusBadge) {
      statusBadge.textContent = "CONFIRMED";
      statusBadge.className = "receipt-badge badge-confirmed";
    }

    const depEl = document.getElementById("receipt-deposit-tx");
    if (depEl && this.latestDepositTxHash) {
      depEl.textContent = this.latestDepositTxHash;
      depEl.title = this.latestDepositTxHash;
    }

    const withEl = document.getElementById("receipt-withdraw-tx");
    if (withEl && this.latestWithdrawTxHash) {
      withEl.textContent = this.latestWithdrawTxHash;
      withEl.title = this.latestWithdrawTxHash;
    }

    const blockTag = document.getElementById("receipt-block-tag");
    if (blockTag) {
      blockTag.textContent = `Blok: #${withdrawData.blockNumber}`;
    }

    const amountTag = document.getElementById("receipt-amount-tag");
    if (amountTag) {
      amountTag.textContent = `Nilai: ${this.vaultDenomination.toFixed(2)} ETH`;
    }

    // 2. Update Floating Banner
    const banner = document.getElementById("floating-tx-banner");
    const bannerTitle = document.getElementById("banner-title");
    const bannerDep = document.getElementById("banner-deposit-tx");
    const bannerWith = document.getElementById("banner-withdraw-tx");

    if (bannerTitle) {
      bannerTitle.textContent = `Putaran #${this.currentRound} Berhasil Dicairkan ke 4 Penerima!`;
    }
    if (bannerDep && this.latestDepositTxHash) {
      bannerDep.textContent = `${this.latestDepositTxHash.slice(0, 16)}...${this.latestDepositTxHash.slice(-8)}`;
      bannerDep.title = this.latestDepositTxHash;
    }
    if (bannerWith && this.latestWithdrawTxHash) {
      bannerWith.textContent = `${this.latestWithdrawTxHash.slice(0, 16)}...${this.latestWithdrawTxHash.slice(-8)}`;
      bannerWith.title = this.latestWithdrawTxHash;
    }

    if (banner) {
      banner.classList.add("show");
      // Auto-hide banner after 20 seconds if user does not dismiss
      setTimeout(() => {
        banner.classList.remove("show");
      }, 20000);
    }
  }

  // ==========================================================================
  // DRAGGABLE RESIZER, FULL-SPACE PANORAMA & FLOATING WINDOW LOGIC
  // ==========================================================================
  setupResizableRightPanel() {
    const resizer = document.getElementById("panel-resizer");
    const btnMax = document.getElementById("btn-maximize-panel");
    const btnFloat = document.getElementById("btn-float-panel");
    const dragHeader = document.getElementById("panel-drag-header");

    // 1. Drag-to-Resize Left Splitter
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer?.addEventListener("mousedown", (e) => {
      if (this.rightPanel.classList.contains("floating-window") || this.rightPanel.classList.contains("full-space")) {
        return;
      }
      isResizing = true;
      startX = e.clientX;
      startWidth = this.rightPanel.offsetWidth;
      document.body.classList.add("resizing-panel");
      this.rightPanel.classList.add("no-transition");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dx = startX - e.clientX;
      const newWidth = Math.max(340, Math.min(window.innerWidth - 44, startWidth + dx));
      this.rightPanel.style.width = `${newWidth}px`;
      this.rightPanel.classList.toggle("is-wide-layout", newWidth >= 800);
    });

    window.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      document.body.classList.remove("resizing-panel");
      this.rightPanel.classList.remove("no-transition");
      this.updateAllCables();
      this.drawMinimap();
    });

    // 2. Full Space (Maximize) Button
    btnMax?.addEventListener("click", () => {
      const isFull = this.rightPanel.classList.toggle("full-space");
      btnMax.classList.toggle("active", isFull);

      if (isFull) {
        this.rightPanel.classList.remove("floating-window");
        btnFloat?.classList.remove("active");
        this.rightPanel.style.width = "";
        this.rightPanel.style.height = "";
        this.rightPanel.style.left = "";
        this.rightPanel.style.top = "";
        btnMax.title = "Kembalikan Ukuran Normal";
        btnMax.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 14h6v6m10-10h-6V4m0 6 7-7M10 14l-7 7"/>
          </svg>
        `;
        this.showToast("⛶ Mode Layar Penuh: Semua kartu ditampilkan berdampingan!");
      } else {
        this.rightPanel.style.width = "420px";
        btnMax.title = "Layar Penuh / Ruang Penuh (Full Space)";
        btnMax.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="icon-maximize">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        `;
        this.showToast("Ukuran panel dikembalikan ke default.");
      }
      setTimeout(() => {
        this.updateAllCables();
        this.drawMinimap();
      }, 300);
    });

    // 3. Floating Window Mode (Pop-out & Drag-and-Drop)
    btnFloat?.addEventListener("click", () => {
      const isFloating = this.rightPanel.classList.toggle("floating-window");
      btnFloat.classList.toggle("active", isFloating);

      if (isFloating) {
        this.rightPanel.classList.remove("full-space");
        btnMax?.classList.remove("active");
        this.rightPanel.style.width = "780px";
        this.rightPanel.style.height = "80vh";
        this.rightPanel.style.left = "";
        this.rightPanel.style.right = "40px";
        this.rightPanel.style.top = "60px";
        this.rightPanel.classList.add("is-wide-layout");
        btnFloat.title = "Kembalikan ke Dock Samping";
        this.showToast("⧉ Mode Jendela Mengambang: Drag header untuk geser, atau tarik sudut kanan-bawah untuk resize!");
      } else {
        this.rightPanel.classList.remove("is-wide-layout");
        this.rightPanel.style.width = "420px";
        this.rightPanel.style.height = "";
        this.rightPanel.style.left = "";
        this.rightPanel.style.top = "";
        btnFloat.title = "Mode Jendela Mengambang (Bisa di-Drag & Drop bebas)";
        this.showToast("Panel dikembalikan ke sisi kanan (Docked).");
      }
      setTimeout(() => {
        this.updateAllCables();
        this.drawMinimap();
      }, 300);
    });

    // 4. Drag & Drop Floating Window Movement
    let isDraggingWindow = false;
    let winOffsetX = 0;
    let winOffsetY = 0;

    dragHeader?.addEventListener("mousedown", (e) => {
      if (!this.rightPanel.classList.contains("floating-window")) return;
      if ((e.target as HTMLElement).closest("button")) return; // Jangan drag jika klik tombol

      isDraggingWindow = true;
      const rect = this.rightPanel.getBoundingClientRect();
      winOffsetX = e.clientX - rect.left;
      winOffsetY = e.clientY - rect.top;
      document.body.classList.add("dragging-panel-window");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDraggingWindow) return;
      const x = Math.max(10, Math.min(window.innerWidth - 100, e.clientX - winOffsetX));
      const y = Math.max(10, Math.min(window.innerHeight - 100, e.clientY - winOffsetY));
      this.rightPanel.style.left = `${x}px`;
      this.rightPanel.style.top = `${y}px`;
      this.rightPanel.style.right = "auto";
    });

    window.addEventListener("mouseup", () => {
      if (!isDraggingWindow) return;
      isDraggingWindow = false;
      document.body.classList.remove("dragging-panel-window");
    });
  }

  setScenario(scenario: "normal" | "hijack" | "doublespend") {
    this.selectedScenario = scenario;
    this.hideDefenseStamp();
    this.highlightScenarioButton(scenario);

    const scenarioMeta = {
      normal: {
        icon: "🚀",
        title: "1. Alur Anonim Penuh (Normal)",
        desc: "Deposit 1.0 ETH baru ➔ Kupon ZK ➔ Split ke 4 teman"
      },
      hijack: {
        icon: "⚔️",
        title: "2. Uji Sabotase Kurir (Front-Running)",
        desc: "Kurir mencoba ganti alamat penerima ke dompetnya"
      },
      doublespend: {
        icon: "⚠️",
        title: "3. Uji Double-Spending",
        desc: "Cairkan kupon putaran sebelumnya untuk kedua kali"
      }
    }[scenario];

    if (scenarioMeta) {
      const iconEl = document.getElementById("active-scenario-icon");
      const titleEl = document.getElementById("active-scenario-title");
      const descEl = document.getElementById("active-scenario-desc");
      if (iconEl) iconEl.textContent = scenarioMeta.icon;
      if (titleEl) titleEl.textContent = scenarioMeta.title;
      if (descEl) descEl.textContent = scenarioMeta.desc;
    }

    if (scenario === "normal") {
      this.setStatusText("Mode: 1. Alur Anonim Normal (Klik 'Run Flow' untuk mulai)");
      this.log("Pilihan disetel: Mode Alur Normal. Silakan klik tombol 'Run Flow' untuk eksekusi.", "normal");
    } else if (scenario === "hijack") {
      this.setStatusText("Mode: 2. Uji Sabotase Kurir (Klik 'Run Flow' untuk mulai)");
      this.log("Pilihan disetel: Mode Uji Sabotase Kurir (Front-Running). Klik 'Run Flow' untuk melihat transaksi dibatalkan.", "warning");
    } else if (scenario === "doublespend") {
      this.setStatusText("Mode: 3. Uji Double-Spending (Klik 'Run Flow' untuk mulai)");
      this.log("Pilihan disetel: Mode Uji Double-Spending. Klik 'Run Flow' untuk melihat pembatalan kupon duplikat.", "warning");
    }
  }

  highlightScenarioButton(scenario: string) {
    document.querySelectorAll(".action-card-btn").forEach((btn) => {
      btn.classList.toggle("active-action", btn.getAttribute("data-scenario") === scenario);
    });
  }

  zoom(delta: number) {
    this.zoomLevel = Math.min(2.5, Math.max(0.35, this.zoomLevel + delta));
    const zoomText = document.getElementById("val-zoom");
    if (zoomText) zoomText.innerText = `${Math.round(this.zoomLevel * 100)}%`;
    this.applyTransform();
    this.updateAllCables();
    this.drawMinimap();
  }

  resetView() {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    const zoomText = document.getElementById("val-zoom");
    if (zoomText) zoomText.innerText = "100%";
    this.applyTransform();
    this.updateAllCables();
    this.drawMinimap();
  }

  applyTransform() {
    this.container.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;

    if (this.dotGridEl) {
      this.dotGridEl.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
      this.dotGridEl.style.backgroundSize = `${24 * this.zoomLevel}px ${24 * this.zoomLevel}px`;
    }
  }

  // ==========================================================================
  // BEZIER CABLES COMPUTATION
  // ==========================================================================
  getPortCenter(portId: string): NodePos {
    const port = document.getElementById(portId);
    if (!port) return { x: 0, y: 0 };
    const rect = port.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2 - canvasRect.left,
      y: rect.top + rect.height / 2 - canvasRect.top,
    };
  }

  createBezierPath(p1: NodePos, p2: NodePos): string {
    const dx = Math.abs(p2.x - p1.x) * 0.5;
    const dy = (p2.y - p1.y) * 0.3;
    return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y + dy}, ${p2.x - dx} ${p2.y - dy}, ${p2.x} ${p2.y}`;
  }

  updateAllCables() {
    const cableConfigs: Array<{ outId: string; inId: string; cableId: string }> = [
      { outId: "port-alice-out", inId: "port-vault-in", cableId: "cable-1" },
      { outId: "port-vault-out", inId: "port-prover-in", cableId: "cable-2" },
      { outId: "port-prover-out", inId: "port-relayer-in", cableId: "cable-3" },
      { outId: "port-relayer-out", inId: "port-recipients-in", cableId: "cable-4" },
    ];

    cableConfigs.forEach(({ outId, inId, cableId }) => {
      const cableEl = document.getElementById(cableId);
      if (!cableEl) return;

      const isConnected = this.activeConnections[outId] === inId;
      if (isConnected) {
        const p1 = this.getPortCenter(outId);
        const p2 = this.getPortCenter(inId);
        cableEl.setAttribute("d", this.createBezierPath(p1, p2));
        cableEl.style.display = "block";
      } else {
        cableEl.setAttribute("d", "");
        cableEl.style.display = "none";
      }
    });

    const allPortIds = [
      "port-alice-out",
      "port-vault-in",
      "port-vault-out",
      "port-prover-in",
      "port-prover-out",
      "port-relayer-in",
      "port-relayer-out",
      "port-recipients-in",
    ];

    allPortIds.forEach((portId) => {
      const portEl = document.getElementById(portId);
      if (!portEl) return;
      const isOut = portEl.getAttribute("data-port-dir") === "out";
      const isConnected = isOut
        ? !!this.activeConnections[portId]
        : Object.values(this.activeConnections).includes(portId);

      if (isConnected) {
        portEl.classList.remove("port-disconnected");
      } else {
        portEl.classList.add("port-disconnected");
      }
    });
  }

  initPortEvents() {
    this.cableDraftEl = document.getElementById("cable-draft") as unknown as SVGPathElement;
    this.cableTooltipEl = document.getElementById("cable-tooltip");

    const ports = document.querySelectorAll(".port");
    ports.forEach((port) => {
      const portEl = port as HTMLElement;
      portEl.addEventListener("mousedown", (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (this.isRunning) return;

        const portId = portEl.getAttribute("data-port-id") || portEl.id;
        const portDir = (portEl.getAttribute("data-port-dir") || "out") as "in" | "out";

        if (portDir === "out") {
          if (this.activeConnections[portId]) {
            delete this.activeConnections[portId];
            this.log(`🔌 Kabel dicopot dari port [${this.portMeta[portId]?.label || portId}].`, "normal");
            this.updateAllCables();
          }
          this.startDrafting(portEl, "out");
        } else {
          const connectedOut = Object.keys(this.activeConnections).find(
            (k) => this.activeConnections[k] === portId
          );
          if (connectedOut) {
            delete this.activeConnections[connectedOut];
            this.log(`🔌 Kabel dicopot dari port [${this.portMeta[portId]?.label || portId}].`, "normal");
            this.updateAllCables();
            const outEl = document.getElementById(connectedOut);
            if (outEl) {
              this.startDrafting(outEl, "out");
            } else {
              this.startDrafting(portEl, "in");
            }
          } else {
            this.startDrafting(portEl, "in");
          }
        }
      });
    });
  }

  startDrafting(portEl: HTMLElement, dir: "in" | "out") {
    this.isDraftingCable = true;
    this.draftSourcePort = portEl;
    this.draftSourceDir = dir;
    this.currentHoveredTarget = null;
    if (this.cableDraftEl) {
      this.cableDraftEl.classList.remove("invalid");
      this.cableDraftEl.style.display = "block";
    }
  }

  stopDrafting() {
    this.isDraftingCable = false;
    this.draftSourcePort = null;
    this.currentHoveredTarget = null;
    if (this.cableDraftEl) {
      this.cableDraftEl.setAttribute("d", "");
      this.cableDraftEl.style.display = "none";
      this.cableDraftEl.classList.remove("invalid");
    }
    document.querySelectorAll(".port").forEach((p) => p.classList.remove("valid-target", "invalid-target"));
    this.hideTooltip();
  }

  validateConnection(sourceEl: HTMLElement, targetEl: HTMLElement): { valid: boolean; message: string } {
    const sourceId = sourceEl.getAttribute("data-port-id") || sourceEl.id;
    const targetId = targetEl.getAttribute("data-port-id") || targetEl.id;
    const sourceDir = sourceEl.getAttribute("data-port-dir");
    const targetDir = targetEl.getAttribute("data-port-dir");

    if (sourceId === targetId) {
      return { valid: false, message: "⛔ Port input & output tidak boleh sama!" };
    }

    if (sourceDir === targetDir) {
      return {
        valid: false,
        message:
          sourceDir === "out"
            ? "⛔ Tidak bisa menghubungkan Output ke Output! Colokkan kabel ke port Input (IN)."
            : "⛔ Tidak bisa menghubungkan Input ke Input! Tarik kabel dari port Output (OUT).",
      };
    }

    const sourceCard = sourceEl.closest(".node-card");
    const targetCard = targetEl.closest(".node-card");
    if (sourceCard && targetCard && sourceCard === targetCard) {
      return { valid: false, message: "⛔ Port input & output berasal dari node yang sama!" };
    }

    const outId = sourceDir === "out" ? sourceId : targetId;
    const inId = sourceDir === "out" ? targetId : sourceId;

    if (this.requiredConnections[outId] === inId) {
      return {
        valid: true,
        message: `🟢 ALUR VALID: ${this.portMeta[outId]?.nodeName || "Out"} ➔ ${this.portMeta[inId]?.nodeName || "In"} terhubung tepat!`,
      };
    }

    const depName = ACCOUNTS_DATA[this.depositorKey]?.name || "Penyetor";
    if (outId === "port-alice-out") {
      return {
        valid: false,
        message: `⛔ BUKAN ALUR YANG TEPAT! Setoran komitmen ${depName} harus masuk ke Brankas ZKVault (Commitment Ingestion) terlebih dahulu, tidak bisa langsung ke node lain.`,
      };
    }
    if (outId === "port-vault-out") {
      return {
        valid: false,
        message:
          "⛔ BUKAN ALUR YANG TEPAT! Akar Merkle ZKVault dibutuhkan oleh Groth16 Prover untuk membuktikan kepemilikan deposit (witness).",
      };
    }
    if (outId === "port-prover-out") {
      return {
        valid: false,
        message:
          "⛔ BUKAN ALUR YANG TEPAT! Kupon bukti ZK harus diserahkan kepada Kurir Relayer untuk penarikan anonim tanpa kaitan ke dompet penyetor.",
      };
    }
    if (outId === "port-relayer-out") {
      return {
        valid: false,
        message:
          "⛔ BUKAN ALUR YANG TEPAT! Pencairan dari Kurir Relayer hanya didistribusikan ke dompet 4 Penerima (Split Payout).",
      };
    }

    return {
      valid: false,
      message: "⛔ BUKAN ALUR YANG TEPAT! Sambungan ini melanggar alur privasi kriptografi ZK.",
    };
  }

  showTooltip(clientX: number, clientY: number, text: string, isValid: boolean) {
    if (!this.cableTooltipEl) return;
    const viewport = document.getElementById("graph-viewport");
    const vRect = viewport ? viewport.getBoundingClientRect() : { left: 0, top: 0 };

    this.cableTooltipEl.innerText = text;
    this.cableTooltipEl.className = `cable-tooltip visible ${isValid ? "valid" : "invalid"}`;
    this.cableTooltipEl.style.left = `${clientX - vRect.left}px`;
    this.cableTooltipEl.style.top = `${clientY - vRect.top}px`;
  }

  hideTooltip() {
    if (!this.cableTooltipEl) return;
    this.cableTooltipEl.className = "cable-tooltip";
  }

  autoWire() {
    this.activeConnections = { ...this.requiredConnections };
    this.updateAllCables();
    this.log("🔌 Auto-Wire: Semua kabel kriptografi berhasil dipasang kembali ke alur standar.", "success");
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    const scale = 0.08;
    const offsetX = 8;
    const offsetY = 8;

    const nodeCards = document.querySelectorAll(".node-card");
    nodeCards.forEach((card) => {
      const htmlCard = card as HTMLElement;
      const x = parseFloat(htmlCard.style.left || "0") * scale + offsetX;
      const y = parseFloat(htmlCard.style.top || "0") * scale + offsetY;
      const nw = htmlCard.offsetWidth * scale;
      const nh = htmlCard.offsetHeight * scale;

      const isSelected = htmlCard.classList.contains("selected");
      ctx.fillStyle = isSelected ? "#ea580c" : "#e2e8f0";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(x, y, nw, nh, 3);
      ctx.fill();
      ctx.stroke();
    });

    const canvasW = this.canvas.offsetWidth || 1000;
    const canvasH = this.canvas.offsetHeight || 600;

    const vpX = (-this.panX / this.zoomLevel) * scale + offsetX;
    const vpY = (-this.panY / this.zoomLevel) * scale + offsetY;
    const vpW = (canvasW / this.zoomLevel) * scale;
    const vpH = (canvasH / this.zoomLevel) * scale;

    ctx.fillStyle = "rgba(234, 88, 12, 0.12)";
    ctx.fillRect(vpX, vpY, vpW, vpH);

    ctx.strokeStyle = "#ea580c";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }

  selectNode(nodeId: string) {
    this.selectedNodeId = nodeId;
    document.querySelectorAll(".node-card").forEach((card) => {
      card.classList.toggle("selected", card.getAttribute("data-node-id") === nodeId);
    });

    const data = this.nodeDatabase[nodeId];
    if (!data) return;

    const titleEl = document.getElementById("inspector-title");
    const bodyEl = document.getElementById("inspector-body");

    if (titleEl) titleEl.innerText = `🔍 ${data.name}`;

    if (bodyEl) {
      const allEntries = Object.entries(data.fields);
      const isTechKey = (k: string) => {
        const lower = k.toLowerCase();
        return (
          lower.includes("secret") ||
          lower.includes("nullifier") ||
          lower.includes("commitment") ||
          lower.includes("hasher") ||
          lower.includes("tree") ||
          lower.includes("constraint") ||
          lower.includes("proof") ||
          lower.includes("signal") ||
          lower.includes("method") ||
          lower.includes("penerima 3") ||
          lower.includes("penerima 4")
        );
      };

      const coreEntries: [string, string][] = [];
      const techEntries: [string, string][] = [];

      allEntries.forEach(([key, val]) => {
        if (isTechKey(key)) {
          techEntries.push([key, val]);
        } else {
          coreEntries.push([key, val]);
        }
      });

      // Pastikan bagian default (core) memiliki maksimal 3 properti esensial
      if (coreEntries.length === 0 && techEntries.length > 0) {
        coreEntries.push(...techEntries.splice(0, Math.min(3, techEntries.length)));
      } else if (coreEntries.length > 3) {
        techEntries.unshift(...coreEntries.splice(3));
      }

      let coreRows = "";
      for (const [key, val] of coreEntries) {
        coreRows += `
          <tr>
            <td class="prop-key">${key}</td>
            <td class="prop-val">${val}</td>
          </tr>
        `;
      }

      let techRows = "";
      for (const [key, val] of techEntries) {
        techRows += `
          <tr>
            <td class="prop-key tech-key">${key}</td>
            <td class="prop-val tech-val">${val}</td>
          </tr>
        `;
      }

      bodyEl.innerHTML = `
        <div class="inspector-card-content">
          <div class="inspector-badge-row">
            <span class="inspector-type-badge">${data.type}</span>
            <span class="inspector-live-tag">● Terhubung</span>
          </div>

          <!-- Default Core Properties (Ringkas & Bersih) -->
          <table class="prop-table prop-table-core">
            <tbody>${coreRows}</tbody>
          </table>

          <!-- Expand on Demand Toggle -->
          ${
            techEntries.length > 0 || data.description
              ? `
            <div class="inspector-expand-wrap">
              <button class="btn-expand-props" id="btn-toggle-tech-props" type="button">
                <span class="expand-icon" id="props-expand-icon">▾</span>
                <span class="expand-label" id="props-expand-label">Detail Kriptografi &amp; Kunci Rahasia</span>
              </button>
            </div>

            <div class="inspector-tech-props" id="inspector-tech-props" hidden>
              ${
                techEntries.length > 0
                  ? `
                <div class="tech-props-header">
                  <span class="tech-icon">🔐</span>
                  <span class="tech-title">Parameter Kriptografi &amp; Sirkuit:</span>
                </div>
                <table class="prop-table prop-table-tech">
                  <tbody>${techRows}</tbody>
                </table>
              `
                  : ""
              }
              <div class="inspector-desc-box">
                <span class="desc-icon">ℹ️</span>
                <p class="desc-text">${data.description}</p>
              </div>
            </div>
          `
              : ""
          }
        </div>
      `;

      const btnToggle = document.getElementById("btn-toggle-tech-props");
      const techProps = document.getElementById("inspector-tech-props");
      const expandIcon = document.getElementById("props-expand-icon");
      const expandLabel = document.getElementById("props-expand-label");

      btnToggle?.addEventListener("click", () => {
        if (!techProps) return;
        const isHidden = techProps.hidden;
        techProps.hidden = !isHidden;
        if (expandIcon) expandIcon.textContent = isHidden ? "▴" : "▾";
        if (expandLabel) expandLabel.textContent = isHidden ? "Sembunyikan Rincian Kriptografi" : "Detail Kriptografi & Kunci Rahasia";
        btnToggle.classList.toggle("active", Boolean(isHidden));
      });
    }

    this.drawMinimap();
  }

  startLiveTimer(): number {
    const startTime = performance.now();
    const timeEl = document.getElementById("telemetry-time");
    if (this.liveTimerInterval) clearInterval(this.liveTimerInterval);

    this.liveTimerInterval = window.setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (timeEl) timeEl.innerText = `${elapsed.toFixed(2)}s`;
    }, 50);

    return startTime;
  }

  stopLiveTimer(startTime: number) {
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
      this.liveTimerInterval = null;
    }
    const finalElapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    const timeEl = document.getElementById("telemetry-time");
    if (timeEl) timeEl.innerText = `${finalElapsed}s`;
    return finalElapsed;
  }

  log(msg: string, type: "normal" | "success" | "error" | "warning" = "normal") {
    const stream = document.getElementById("log-stream");
    if (!stream) return;

    const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-msg ${type}">${msg}</span>
    `;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }

  setStepBadge(text: string) {
    const badge = document.getElementById("step-badge");
    if (badge) badge.innerText = text;
  }

  setRoundBadge(round: number) {
    const badge = document.getElementById("round-badge");
    if (badge) badge.innerText = round === 0 ? "ROUND #0" : `ROUND #${round}`;
  }

  setStatusText(text: string) {
    const el = document.getElementById("status-text");
    if (el) el.innerText = text;
  }

  showDefenseStamp(targetNodeId: string, badgeTag: string, title: string, desc: string) {
    const targetNode = document.getElementById(targetNodeId);
    if (!targetNode) return;

    const rect = targetNode.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    const cx = rect.left + rect.width / 2 - canvasRect.left;
    const cy = rect.top + rect.height / 2 - canvasRect.top;

    this.defenseStamp.style.left = `${cx}px`;
    this.defenseStamp.style.top = `${cy}px`;

    const tagEl = document.getElementById("defense-badge-tag");
    const titleEl = document.getElementById("defense-title");
    const descEl = document.getElementById("defense-desc");

    if (tagEl) tagEl.innerText = badgeTag;
    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerText = desc;

    this.defenseStamp.classList.add("visible");
    targetNode.classList.add("node-shake");
  }

  hideDefenseStamp() {
    this.defenseStamp.classList.remove("visible");
    document.querySelectorAll(".node-card").forEach((c) => c.classList.remove("node-shake"));
    document.querySelectorAll(".cable").forEach((c) => c.classList.remove("cable-attack-failed"));
  }

  runSelectedScenario() {
    if (this.isRunning) return;

    const depName = ACCOUNTS_DATA[this.depositorKey]?.name || "Penyetor";
    const missingWires: string[] = [];
    if (this.activeConnections["port-alice-out"] !== "port-vault-in") {
      missingWires.push(`${depName} ➔ ZKVault (Deposit Commitment)`);
    }
    if (this.activeConnections["port-vault-out"] !== "port-prover-in") {
      missingWires.push("ZKVault ➔ Groth16 Prover (Merkle Root)");
    }
    if (this.activeConnections["port-prover-out"] !== "port-relayer-in") {
      missingWires.push("Groth16 Prover ➔ Relayer (ZK Proof)");
    }
    if (this.activeConnections["port-relayer-out"] !== "port-recipients-in") {
      missingWires.push("Relayer ➔ 4 Penerima (Payout Split)");
    }

    if (missingWires.length > 0) {
      this.log(`⛔ TIDAK DAPAT MENJALANKAN ALUR! Ada ${missingWires.length} kabel yang belum tersambung atau salah alur:`, "error");
      missingWires.forEach((w) => this.log(`   • Kabel ${w}`, "error"));
      this.log(`💡 Solusi: Pasang kabel ke port yang benar, atau klik tombol [Auto-Wire] di toolbar kiri untuk memasang otomatis.`, "warning");

      document.querySelectorAll(".port.port-disconnected").forEach((p) => {
        p.classList.add("invalid-target");
        setTimeout(() => p.classList.remove("invalid-target"), 1200);
      });
      return;
    }

    if (this.selectedScenario === "normal") {
      this.runNormalRound();
    } else if (this.selectedScenario === "hijack") {
      this.runHijackAttack();
    } else if (this.selectedScenario === "doublespend") {
      this.runDoubleSpendAttack();
    }
  }

  // ==========================================================================
  // 1. NORMAL CUMULATIVE ROUND (DYNAMIC DEPOSITOR, RECEIVERS & ETH VALUE)
  // ==========================================================================
  async runNormalRound() {
    this.isRunning = true;
    this.hideDefenseStamp();

    const btnRun = document.getElementById("btn-run-workflow") as HTMLButtonElement;
    if (btnRun) btnRun.disabled = true;

    const startTime = this.startLiveTimer();
    const dep = ACCOUNTS_DATA[this.depositorKey];
    const splitEth = (this.vaultDenomination / 4).toFixed(4);

    this.currentRound++;
    this.setRoundBadge(this.currentRound);
    this.log(`🚀 [PUTARAN #${this.currentRound}] Memulai alur ZK-Splitter di Hardhat EVM (Penyetor: ${dep.name}, Nilai: ${this.vaultDenomination.toFixed(2)} ETH)...`, "normal");

    // STEP 1: Dynamic Depositor Deposit On-Chain
    this.selectNode("alice");
    this.setStepBadge("STEP 1/4");
    this.setStatusText(`Putaran #${this.currentRound} - 1. ${dep.name} Menyetor ${this.vaultDenomination.toFixed(2)} ETH`);

    const nodeAlice = document.getElementById("node-alice");
    const nodeVault = document.getElementById("node-vault");
    const cable1 = document.getElementById("cable-1");

    nodeAlice?.classList.add("running-step");
    cable1?.setAttribute("class", "cable cable-active");

    this.log(`${dep.name} membuat rahasia (secret & nullifier) dan menyetor ${this.vaultDenomination.toFixed(2)} ETH ke smart contract ZKVault on-chain...`, "normal");

    let depositData: any;
    try {
      const depRes = await fetch("/api/deposit", { method: "POST" });
      depositData = await depRes.json();
      if (!depositData.success) throw new Error(depositData.error);
    } catch (e: any) {
      this.log(`❌ Gagal menyetor ke blockchain: ${e.message}`, "error");
      this.stopLiveTimer(startTime);
      if (btnRun) btnRun.disabled = false;
      this.isRunning = false;
      return;
    }

    this.currentSecretHex = depositData.deposit.secretHex;
    this.currentNullifierHex = depositData.deposit.nullifierHex;
    this.currentCommitmentHex = depositData.deposit.commitmentHex;
    this.currentNullifierHashHex = depositData.deposit.nullifierHashHex;
    this.previousNullifiers.push(this.currentNullifierHashHex);

    document.getElementById("val-secret")!.innerText = `${this.currentSecretHex.slice(0, 10)}... (254-bit)`;
    document.getElementById("val-nullifier")!.innerText = `${this.currentNullifierHex.slice(0, 10)}... (254-bit)`;
    document.getElementById("val-nullifier-hash")!.innerText = `${this.currentNullifierHashHex.slice(0, 10)}...`;

    this.accountBalances[this.depositorKey] = parseFloat(depositData.balances.depositor);
    this.vaultBalance = parseFloat(depositData.balances.vault);
    this.updateDynamicUI();

    this.latestDepositTxHash = depositData.txHash;
    const depEl = document.getElementById("receipt-deposit-tx");
    if (depEl) {
      depEl.textContent = this.latestDepositTxHash;
      depEl.title = this.latestDepositTxHash;
    }

    this.log(
      `✅ On-chain Deposit Sukses! Dana ${this.vaultDenomination.toFixed(2)} ETH masuk dan ditampung ke Smart Contract ZKVault (Saldo Kontrak Saat Ini: ${depositData.balances.vault}). Tx: ${depositData.txHash.slice(0, 16)}... (Block #${depositData.blockNumber})`,
      "success"
    );
    await this.delay(1000);
    nodeAlice?.classList.remove("running-step");

    // STEP 2: Merkle Tree Ingestion
    this.selectNode("vault");
    this.setStepBadge("STEP 2/4");
    this.setStatusText(`Putaran #${this.currentRound} - 2. Pohon Merkle`);

    nodeVault?.classList.add("running-step");
    const cable2 = document.getElementById("cable-2");
    cable2?.setAttribute("class", "cable cable-flow-purple");

    document.getElementById("val-merkle-root")!.innerText = `${depositData.merkleRootHex.slice(0, 10)}...`;
    this.log(`✅ Daun komitmen dimasukkan ke Merkle Tree pada Index #${depositData.leafIndex}. Akar Baru: ${depositData.merkleRootHex.slice(0, 14)}...`, "success");
    this.updateDynamicUI();

    await this.delay(900);
    nodeVault?.classList.remove("running-step");

    // STEP 3: Real ZK Proof Computation with SnarkJS
    this.selectNode("prover");
    this.setStepBadge("STEP 3/4");
    this.setStatusText(`Putaran #${this.currentRound} - 3. Groth16 Prover`);

    const nodeProver = document.getElementById("node-prover");
    nodeProver?.classList.add("running-step");
    const cable3 = document.getElementById("cable-3");
    cable3?.setAttribute("class", "cable cable-flow-orange");

    this.log(`Groth16 Prover (SnarkJS) sedang menghitung bukti ZK nyata untuk 4 penerima [${this.recipientKeys.map((k) => ACCOUNTS_DATA[k].name).join(", ")}]...`, "normal");

    let proveData: any;
    try {
      const prvRes = await fetch("/api/prove", { method: "POST" });
      proveData = await prvRes.json();
      if (!proveData.success) throw new Error(proveData.error);
    } catch (e: any) {
      this.log(`❌ Gagal menghitung bukti ZK: ${e.message}`, "error");
      this.stopLiveTimer(startTime);
      if (btnRun) btnRun.disabled = false;
      this.isRunning = false;
      return;
    }

    document.getElementById("val-proof-time")!.innerText = `${proveData.provingTimeMs} ms (Groth16)`;
    this.log(`✅ Bukti ZK asli selesai dihitung dalam ${proveData.provingTimeMs} ms! Terkunci pada 4 alamat penerima.`, "success");
    this.updateDynamicUI();

    await this.delay(800);
    nodeProver?.classList.remove("running-step");

    // STEP 4: Relayer Execution & Payout On-Chain
    this.selectNode("relayer");
    this.setStepBadge("STEP 4/4");
    this.setStatusText(`Putaran #${this.currentRound} - 4. Kurir Mencairkan`);

    const nodeRelayer = document.getElementById("node-relayer");
    const nodeRecipients = document.getElementById("node-recipients");
    nodeRelayer?.classList.add("running-step");
    const cable4 = document.getElementById("cable-4");
    cable4?.setAttribute("class", "cable cable-flow-green");

    this.log("Kurir Relayer memanggil `ZKVault.withdrawSplit(...)` di blockchain...", "normal");

    let withdrawData: any;
    try {
      const wRes = await fetch("/api/withdraw", { method: "POST" });
      withdrawData = await wRes.json();
      if (!withdrawData.success) throw new Error(withdrawData.error);
    } catch (e: any) {
      this.log(`❌ Gagal mencairkan on-chain: ${e.message}`, "error");
      this.stopLiveTimer(startTime);
      if (btnRun) btnRun.disabled = false;
      this.isRunning = false;
      return;
    }

    const valTxStatus = document.getElementById("val-tx-status");
    if (valTxStatus) {
      valTxStatus.innerText = `Confirmed (Tx: ${withdrawData.txHash.slice(0, 10)}...)`;
      valTxStatus.className = "code-val text-success";
    }

    this.vaultBalance = parseFloat(withdrawData.balances.vault);
    this.relayerBalance = parseFloat(withdrawData.balances.relayer);

    this.latestWithdrawTxHash = withdrawData.txHash;
    if (withdrawData.depositTxHash) {
      this.latestDepositTxHash = withdrawData.depositTxHash;
    }
    this.displayOnChainReceipt(withdrawData);
    this.fetchWithdrawHistory();

    if (withdrawData.recipients && Array.isArray(withdrawData.recipients)) {
      withdrawData.recipients.forEach((rec: any) => {
        if (rec.key && this.accountBalances[rec.key] !== undefined) {
          this.accountBalances[rec.key] = parseFloat(rec.balance);
        }
      });
    }

    this.updateDynamicUI();
    this.selectNode("recipients");

    document.querySelectorAll(".recipient-item").forEach((item) => item.classList.add("received"));
    nodeRecipients?.classList.add("running-step");

    this.log(`✅ Transaksi Konfirmasi di Block #${withdrawData.blockNumber}! Tx: ${withdrawData.txHash.slice(0, 16)}... (Gas: ${withdrawData.gasUsed})`, "success");
    this.log(
      `💸 Brankas Kontrak Mencairkan Dana: Seluruh ${this.vaultDenomination.toFixed(2)} ETH dibagikan rata ke 4 dompet penerima (masing-masing +${splitEth} ETH). Saldo brankas kembali menjadi ${withdrawData.balances.vault}.`,
      "normal"
    );
    this.log(
      `🎉 [SELESAI PUTARAN #${this.currentRound}] 4 Penerima masing-masing menerima +${splitEth} ETH langsung dari kontrak!`,
      "success"
    );
    this.log(`🛡️ AUDIT ON-CHAIN: 100% Tidak Ada Jejak antara ${dep.name} dan Penerima!`, "success");

    await this.delay(1000);
    nodeRelayer?.classList.remove("running-step");
    nodeRecipients?.classList.remove("running-step");

    const totalDuration = this.stopLiveTimer(startTime);
    this.setStepBadge("SELESAI");
    this.setStatusText(`Putaran #${this.currentRound} Selesai Sukses (${totalDuration}s)`);

    if (btnRun) btnRun.disabled = false;
    this.isRunning = false;
  }

  // ==========================================================================
  // 2. HIJACK / FRONT-RUNNING ATTACK (REAL ON-CHAIN REVERT)
  // ==========================================================================
  async runHijackAttack() {
    this.isRunning = true;
    this.hideDefenseStamp();

    const btnRun = document.getElementById("btn-run-workflow") as HTMLButtonElement;
    if (btnRun) btnRun.disabled = true;

    const startTime = this.startLiveTimer();

    this.log("⚔️ [UJI SABOTASE] Kurir nakal mencoba membajak alamat penerima ke dompetnya sendiri di blockchain!", "warning");
    this.setStepBadge("ATTACKING...");
    this.setStatusText("Kurir Memanipulasi Alamat Penerima...");

    this.selectNode("relayer");
    const nodeRelayer = document.getElementById("node-relayer");
    const cable4 = document.getElementById("cable-4");

    nodeRelayer?.classList.add("running-step");
    cable4?.setAttribute("class", "cable cable-flow-orange");
    await this.delay(1000);

    this.log("Kurir memanggil `withdrawSplit` dengan mengganti salah satu penerima menjadi rekening hacker (0x0000...bEEF)...", "warning");
    cable4?.setAttribute("class", "cable cable-attack-failed");

    const res = await fetch("/api/attack/hijack", { method: "POST" });
    const data = await res.json();

    this.selectNode("recipients");

    this.showDefenseStamp(
      "node-recipients",
      "🛑 TRANSAKSI DIBATALKAN (REVERTED)",
      data.defenseTitle || "Sabotase Kurir Berhasil Dicegat On-Chain!",
      data.defenseDesc || "Verifier Groth16 mendeteksi ketidakcocokan bukti ZK dengan daftar penerima. Smart contract menolak transfer!"
    );

    this.log(`❌ EVM REVERTED ON-CHAIN: '${data.reason || "Invalid ZK proof"}'!`, "error");
    this.log("🛡️ PENCEGAHAN BERHASIL: Bukti ZK mengunci 4 alamat penerima asli. Usaha pembajakan kurir gagal total!", "success");

    const valTxStatus = document.getElementById("val-tx-status");
    if (valTxStatus) {
      valTxStatus.innerText = "REVERTED (Invalid ZK Proof)";
      valTxStatus.className = "code-val text-danger";
    }

    this.stopLiveTimer(startTime);
    this.setStepBadge("DEFENDED");
    this.setStatusText("Sabotase Berhasil Dicegat On-Chain");

    if (btnRun) btnRun.disabled = false;
    this.isRunning = false;
  }

  // ==========================================================================
  // 3. DOUBLE-SPEND ATTACK (REAL ON-CHAIN REVERT)
  // ==========================================================================
  async runDoubleSpendAttack() {
    this.isRunning = true;
    this.hideDefenseStamp();

    const btnRun = document.getElementById("btn-run-workflow") as HTMLButtonElement;
    if (btnRun) btnRun.disabled = true;

    const startTime = this.startLiveTimer();

    this.log("⚠️ [UJI DOUBLE-SPEND] Mencoba mencairkan kupon ZK yang sama untuk kedua kalinya ke blockchain...", "warning");
    this.setStepBadge("ATTACKING...");
    this.setStatusText("Mencoba Double-Spending Kupon...");

    this.selectNode("vault");
    const nodeVault = document.getElementById("node-vault");
    const cable2 = document.getElementById("cable-2");

    nodeVault?.classList.add("running-step");
    cable2?.setAttribute("class", "cable cable-attack-failed");

    const res = await fetch("/api/attack/doublespend", { method: "POST" });
    const data = await res.json();

    await this.delay(1000);

    this.showDefenseStamp(
      "node-vault",
      "⛔ DOUBLE-SPEND DITOLAK (REVERTED)",
      data.defenseTitle || "Double-Spending Dicegah On-Chain!",
      data.defenseDesc || "Nullifier telah tercatat sebagai SPENT di smart contract ZKVault."
    );

    this.log(`❌ EVM REVERTED ON-CHAIN: '${data.reason || "Nullifier already spent"}'!`, "error");
    this.log("🛡️ PENCEGAHAN BERHASIL: Kontrak menolak double-spending on-chain!", "success");

    this.stopLiveTimer(startTime);
    this.setStepBadge("DEFENDED");
    this.setStatusText("Double-Spend Berhasil Dicegah");

    if (btnRun) btnRun.disabled = false;
    this.isRunning = false;
  }

  // ==========================================================================
  // RESET TO INITIAL STATE
  // ==========================================================================
  resetSimulation() {
    this.hideDefenseStamp();
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
      this.liveTimerInterval = null;
    }
    const timeEl = document.getElementById("telemetry-time");
    if (timeEl) timeEl.innerText = "0.00s";

    this.currentRound = 0;
    this.previousNullifiers = [];

    this.fetchBlockchainStatus();
    this.setRoundBadge(0);
    this.setStepBadge("READY");
    this.setScenario("normal");
    this.highlightScenarioButton("normal");
    this.selectNode("alice");

    const valTxStatus = document.getElementById("val-tx-status");
    if (valTxStatus) {
      valTxStatus.innerText = "Menunggu eksekusi";
      valTxStatus.className = "code-val text-muted";
    }

    document.querySelectorAll(".recipient-item").forEach((item) => item.classList.remove("received"));
    document.querySelectorAll(".node-card").forEach((card) => card.classList.remove("running-step"));

    this.activeConnections = { ...this.requiredConnections };
    this.updateAllCables();

    for (let i = 1; i <= 4; i++) {
      const c = document.getElementById(`cable-${i}`);
      if (c) c.setAttribute("class", "cable cable-inactive");
    }

    this.log("↺ Sistem direset: Tampilan disinkronkan kembali dengan data live blockchain dan putaran kembali ke 0.", "normal");
  }

  delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize on DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  new ZKWorkflowGraph();
});
