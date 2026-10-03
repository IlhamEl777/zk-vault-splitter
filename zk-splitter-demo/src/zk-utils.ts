import { ethers } from "ethers";
// @ts-ignore
import { buildPoseidon } from "circomlibjs";
// @ts-ignore
import * as snarkjs from "snarkjs";

export interface MerkleProof {
  root: string;
  pathElements: string[];
  pathIndices: number[];
}

export class ZKTree {
  levels: number;
  capacity: number;
  zeros: bigint[];
  leaves: bigint[];
  poseidon: any;
  F: any;

  constructor(levels: number, poseidon: any) {
    this.levels = levels;
    this.capacity = 2 ** levels;
    this.poseidon = poseidon;
    this.F = poseidon.F;
    this.leaves = [];

    // Precalculate zeros matching Solidity MerkleTreeWithHistory
    this.zeros = new Array(levels + 1);
    this.zeros[0] = 0n;
    for (let i = 1; i <= levels; i++) {
      this.zeros[i] = BigInt(this.F.toString(this.poseidon([this.zeros[i - 1], this.zeros[i - 1]])));
    }
  }

  insert(leaf: bigint): number {
    if (this.leaves.length >= this.capacity) {
      throw new Error("Tree is full");
    }
    const index = this.leaves.length;
    this.leaves.push(leaf);
    return index;
  }

  getRoot(): bigint {
    return this.calculateSubtreeRoot(0, this.levels);
  }

  private calculateSubtreeRoot(startIndex: number, level: number): bigint {
    const subtreeSize = 2 ** level;
    const leafCount = this.leaves.length;

    if (startIndex >= leafCount) {
      return this.zeros[level];
    }

    if (level === 0) {
      return this.leaves[startIndex];
    }

    const halfSize = subtreeSize / 2;
    const left = this.calculateSubtreeRoot(startIndex, level - 1);
    const right = this.calculateSubtreeRoot(startIndex + halfSize, level - 1);

    return BigInt(this.F.toString(this.poseidon([left, right])));
  }

  generateProof(leafIndex: number): MerkleProof {
    if (leafIndex >= this.leaves.length) {
      throw new Error("Leaf index out of bounds");
    }

    const pathElements: string[] = [];
    const pathIndices: number[] = [];

    // Construct level-by-level nodes
    let currentNodes: bigint[] = [];
    for (let i = 0; i < this.capacity; i++) {
      currentNodes.push(i < this.leaves.length ? this.leaves[i] : 0n);
    }

    let currentIndex = leafIndex;
    for (let level = 0; level < this.levels; level++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      pathIndices.push(isRight ? 1 : 0);
      pathElements.push(currentNodes[siblingIndex].toString());

      // Compute next level
      const nextLevel: bigint[] = [];
      for (let j = 0; j < currentNodes.length; j += 2) {
        const left = currentNodes[j];
        const right = currentNodes[j + 1];
        const parent = BigInt(this.F.toString(this.poseidon([left, right])));
        nextLevel.push(parent);
      }
      currentNodes = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      root: currentNodes[0].toString(),
      pathElements,
      pathIndices,
    };
  }
}

export interface DepositSecret {
  secret: bigint;
  nullifier: bigint;
  commitment: bigint;
  nullifierHash: bigint;
}

export async function createDeposit(): Promise<{
  poseidon: any;
  deposit: DepositSecret;
}> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Generate 248-bit random secret and nullifier
  const secret = BigInt(ethers.hexlify(ethers.randomBytes(31)));
  const nullifier = BigInt(ethers.hexlify(ethers.randomBytes(31)));

  // commitment = Poseidon(nullifier, secret)
  const commitmentRaw = poseidon([nullifier, secret]);
  const commitment = BigInt(F.toString(commitmentRaw));

  // nullifierHash = Poseidon(nullifier)
  const nullifierHashRaw = poseidon([nullifier]);
  const nullifierHash = BigInt(F.toString(nullifierHashRaw));

  return {
    poseidon,
    deposit: {
      secret,
      nullifier,
      commitment,
      nullifierHash,
    },
  };
}

export async function generateProofAndCalldata(
  deposit: DepositSecret,
  merkleProof: MerkleProof,
  recipients: string[],
  wasmPath = "build/splitter_js/splitter.wasm",
  zkeyPath = "build/splitter_final.zkey"
) {
  if (recipients.length !== 4) {
    throw new Error("Exactly 4 recipients required");
  }

  const recipientBigInts = recipients.map((r) => BigInt(r).toString());

  const circuitInput = {
    root: merkleProof.root,
    nullifierHash: deposit.nullifierHash.toString(),
    recipients: recipientBigInts,
    secret: deposit.secret.toString(),
    nullifier: deposit.nullifier.toString(),
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath
  );

  const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const parsedCalldata = JSON.parse(`[${calldataStr}]`);

  return {
    proof,
    publicSignals,
    pA: parsedCalldata[0] as [string, string],
    pB: parsedCalldata[1] as [[string, string], [string, string]],
    pC: parsedCalldata[2] as [string, string],
    pubSignals: parsedCalldata[3] as string[],
  };
}
