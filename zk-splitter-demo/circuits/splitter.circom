pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

// Verifies a 1-to-4 private split from an on-chain deposit in a Merkle tree
template ZKSplitter(levels) {
    // Public inputs (verified on-chain by the smart contract)
    signal input root;
    signal input nullifierHash;
    signal input recipients[4];

    // Private inputs (known only by the depositor)
    signal input secret;
    signal input nullifier;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // 1. Compute commitment = Poseidon(nullifier, secret)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;
    signal commitment <== commitmentHasher.out;

    // 2. Verify nullifierHash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

    // 3. Verify Merkle Tree membership proof
    component switchers[levels];
    component hashers[levels];
    signal currentHash[levels + 1];
    currentHash[0] <== commitment;

    for (var i = 0; i < levels; i++) {
        // Enforce pathIndices[i] is binary (0 or 1)
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        switchers[i] = Switcher();
        switchers[i].sel <== pathIndices[i];
        switchers[i].L <== currentHash[i];
        switchers[i].R <== pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;

        currentHash[i + 1] <== hashers[i].out;
    }

    // Verify computed root matches public root
    root === currentHash[levels];

    // 4. Bind the 4 recipients to the proof (front-running protection)
    // Constraining recipients ensures that the proof is cryptographically tied
    // to these exact 4 addresses. If a relayer or attacker modifies any address,
    // the Groth16 pairing check fails on-chain.
    signal recipientSquare[4];
    for (var i = 0; i < 4; i++) {
        recipientSquare[i] <== recipients[i] * recipients[i];
    }
}

component main {public [root, nullifierHash, recipients]} = ZKSplitter(8);
