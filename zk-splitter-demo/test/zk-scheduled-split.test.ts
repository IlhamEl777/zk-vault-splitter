import { expect } from "chai";
import { ethers } from "hardhat";
// @ts-ignore
import { poseidonContract } from "circomlibjs";
import { createDeposit, ZKTree, generateProofAndCalldata } from "../src/zk-utils";

describe("ZK Private Vault - Stealth Staggered & Randomized Split", function () {
  this.timeout(120000);

  let deployer: any;
  let alice: any;
  let bob: any;
  let charlie: any;
  let dave: any;
  let eve: any;
  let relayer: any;

  let poseidonInstance: any;
  let verifierContract: any;
  let vaultContract: any;

  beforeEach(async function () {
    [deployer, alice, bob, charlie, dave, eve, relayer] = await ethers.getSigners();

    // 1. Deploy Poseidon
    const PoseidonABI = poseidonContract.generateABI(2);
    const PoseidonBytecode = poseidonContract.createCode(2);
    const PoseidonFactory = new ethers.ContractFactory(PoseidonABI, PoseidonBytecode, deployer);
    poseidonInstance = await PoseidonFactory.deploy();
    await poseidonInstance.waitForDeployment();
    const poseidonAddress = await poseidonInstance.getAddress();

    // 2. Deploy Groth16Verifier
    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    verifierContract = await VerifierFactory.deploy();
    await verifierContract.waitForDeployment();
    const verifierAddress = await verifierContract.getAddress();

    // 3. Deploy ZKVault
    const VaultFactory = await ethers.getContractFactory("ZKVault");
    vaultContract = await VaultFactory.deploy(verifierAddress, poseidonAddress);
    await vaultContract.waitForDeployment();
  });

  it("Should withdraw with randomized amounts and delayed timelock schedules", async function () {
    const { poseidon, deposit } = await createDeposit();
    const zkTree = new ZKTree(8, poseidon);

    // Alice deposits 1.0 ETH
    await vaultContract.connect(alice).deposit(deposit.commitment, {
      value: ethers.parseEther("1.0"),
    });
    const leafIndex = zkTree.insert(deposit.commitment);

    const recipients = [bob.address, charlie.address, dave.address, eve.address];
    const initialBals = await Promise.all(recipients.map((r) => ethers.provider.getBalance(r)));

    // Generate ZK proof
    const merkleProof = zkTree.generateProof(leafIndex);
    const { pA, pB, pC } = await generateProofAndCalldata(deposit, merkleProof, recipients);

    // Define randomized amounts that sum to 1.0 ETH
    const amounts = [
      ethers.parseEther("0.18"),
      ethers.parseEther("0.32"),
      ethers.parseEther("0.14"),
      ethers.parseEther("0.36"),
    ];
    // Define delays in seconds: slot 0 (0s/immediate), slot 1 (15s), slot 2 (30s), slot 3 (60s)
    const delays = [0, 15, 30, 60];

    // Relayer initiates withdrawScheduledSplit
    const tx = await vaultContract.connect(relayer).withdrawScheduledSplit(
      pA,
      pB,
      pC,
      merkleProof.root,
      deposit.nullifierHash,
      recipients,
      amounts,
      delays
    );
    const receipt = await tx.wait();

    // Verify ScheduledSplitCreated event
    const event = receipt.logs.find((log: any) => {
      try {
        return vaultContract.interface.parseLog(log)?.name === "ScheduledSplitCreated";
      } catch {
        return false;
      }
    });
    expect(event).to.not.be.undefined;
    const parsedEvent = vaultContract.interface.parseLog(event!);
    const batchId = parsedEvent.args[0];

    // Check slot 0 (delay 0) was paid immediately
    const bobBalAfter = await ethers.provider.getBalance(bob.address);
    expect(bobBalAfter - initialBals[0]).to.equal(amounts[0]);

    // Check slot 1 cannot be executed before 15s
    await expect(
      vaultContract.connect(relayer).executeScheduledPayout(batchId, 1)
    ).to.be.revertedWith("Payout timelock not yet expired");

    // Advance EVM time by 16 seconds
    await ethers.provider.send("evm_increaseTime", [16]);
    await ethers.provider.send("evm_mine", []);

    // Now slot 1 can be executed
    await vaultContract.connect(relayer).executeScheduledPayout(batchId, 1);
    const charlieBalAfter = await ethers.provider.getBalance(charlie.address);
    expect(charlieBalAfter - initialBals[1]).to.equal(amounts[1]);

    // Slot 1 cannot be executed twice
    await expect(
      vaultContract.connect(relayer).executeScheduledPayout(batchId, 1)
    ).to.be.revertedWith("Payout slot already executed");

    // Advance time by another 50 seconds to pass slot 2 (30s) and slot 3 (60s)
    await ethers.provider.send("evm_increaseTime", [50]);
    await ethers.provider.send("evm_mine", []);

    // Execute slots 2 and 3
    await vaultContract.connect(relayer).executeScheduledPayout(batchId, 2);
    await vaultContract.connect(relayer).executeScheduledPayout(batchId, 3);

    const daveBalAfter = await ethers.provider.getBalance(dave.address);
    const eveBalAfter = await ethers.provider.getBalance(eve.address);

    expect(daveBalAfter - initialBals[2]).to.equal(amounts[2]);
    expect(eveBalAfter - initialBals[3]).to.equal(amounts[3]);

    // Verify batch is completed
    const [views, completed] = await vaultContract.getBatchPayouts(batchId);
    expect(completed).to.be.true;
    expect(views[0].executed).to.be.true;
    expect(views[1].executed).to.be.true;
    expect(views[2].executed).to.be.true;
    expect(views[3].executed).to.be.true;

    // Verify vault balance is now 0
    const vaultBal = await ethers.provider.getBalance(await vaultContract.getAddress());
    expect(vaultBal).to.equal(0n);
  });

  it("Should revert if randomized amounts do not sum up to denomination", async function () {
    const { poseidon, deposit } = await createDeposit();
    const zkTree = new ZKTree(8, poseidon);

    await vaultContract.connect(alice).deposit(deposit.commitment, {
      value: ethers.parseEther("1.0"),
    });
    const leafIndex = zkTree.insert(deposit.commitment);

    const recipients = [bob.address, charlie.address, dave.address, eve.address];
    const merkleProof = zkTree.generateProof(leafIndex);
    const { pA, pB, pC } = await generateProofAndCalldata(deposit, merkleProof, recipients);

    // Sum is 0.9 ETH (less than 1.0 ETH)
    const badAmounts = [
      ethers.parseEther("0.2"),
      ethers.parseEther("0.2"),
      ethers.parseEther("0.2"),
      ethers.parseEther("0.3"),
    ];
    const delays = [0, 10, 20, 30];

    await expect(
      vaultContract.connect(relayer).withdrawScheduledSplit(
        pA,
        pB,
        pC,
        merkleProof.root,
        deposit.nullifierHash,
        recipients,
        badAmounts,
        delays
      )
    ).to.be.revertedWith("Total amounts must equal vault denomination");
  });

  it("Should prevent double-spending when using withdrawScheduledSplit", async function () {
    const { poseidon, deposit } = await createDeposit();
    const zkTree = new ZKTree(8, poseidon);

    await vaultContract.connect(alice).deposit(deposit.commitment, {
      value: ethers.parseEther("1.0"),
    });
    const leafIndex = zkTree.insert(deposit.commitment);

    const recipients = [bob.address, charlie.address, dave.address, eve.address];
    const merkleProof = zkTree.generateProof(leafIndex);
    const { pA, pB, pC } = await generateProofAndCalldata(deposit, merkleProof, recipients);

    const amounts = [
      ethers.parseEther("0.25"),
      ethers.parseEther("0.25"),
      ethers.parseEther("0.25"),
      ethers.parseEther("0.25"),
    ];
    const delays = [0, 10, 20, 30];

    // First scheduled withdrawal
    await vaultContract.connect(relayer).withdrawScheduledSplit(
      pA,
      pB,
      pC,
      merkleProof.root,
      deposit.nullifierHash,
      recipients,
      amounts,
      delays
    );

    // Attempt second withdrawal with same nullifier
    await expect(
      vaultContract.connect(relayer).withdrawScheduledSplit(
        pA,
        pB,
        pC,
        merkleProof.root,
        deposit.nullifierHash,
        recipients,
        amounts,
        delays
      )
    ).to.be.revertedWith("Nullifier already spent (double-spending prevented)");
  });
});
