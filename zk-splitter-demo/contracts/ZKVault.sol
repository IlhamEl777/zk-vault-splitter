// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MerkleTreeWithHistory.sol";
import "./Groth16Verifier.sol";

contract ZKVault is MerkleTreeWithHistory {
    uint256 public denomination;
    uint256 public constant SPLIT_COUNT = 4;

    Groth16Verifier public immutable verifier;

    // Track spent nullifiers to prevent double spending
    mapping(uint256 => bool) public nullifierSpent;

    // Commitments history
    mapping(uint256 => bool) public commitments;

    event Deposit(uint256 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event WithdrawSplit(
        uint256 indexed nullifierHash,
        address[4] recipients,
        uint256 amountPerRecipient,
        address relayer
    );
    event DenominationChanged(uint256 newDenomination);

    constructor(address _verifier, address _poseidon) MerkleTreeWithHistory(_poseidon) {
        verifier = Groth16Verifier(_verifier);
        denomination = 1 ether; // Default to 1.0 ETH
    }

    /**
     * @notice Set vault denomination dynamically.
     * @param _newDenomination New deposit/split amount in wei.
     */
    function setDenomination(uint256 _newDenomination) external {
        require(_newDenomination >= 0.04 ether, "Min denomination is 0.04 ETH");
        denomination = _newDenomination;
        emit DenominationChanged(_newDenomination);
    }

    /**
     * @notice Returns split amount per recipient (denomination / 4).
     */
    function splitAmount() public view returns (uint256) {
        return denomination / SPLIT_COUNT;
    }

    /**
     * @notice Deposit current denomination into the vault with a secret commitment.
     * @param _commitment Poseidon(nullifier, secret)
     */
    function deposit(uint256 _commitment) external payable {
        require(msg.value == denomination, "Deposit amount must match vault denomination");
        require(!commitments[_commitment], "Commitment already exists");

        commitments[_commitment] = true;
        uint32 leafIndex = _insert(_commitment);

        emit Deposit(_commitment, leafIndex, block.timestamp);
    }

    /**
     * @notice Withdraw and split vault denomination into 4 recipient wallets using a valid ZK proof.
     * @dev Called by a relayer (kurir) or any party off-chain.
     */
    function withdrawSplit(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256 _root,
        uint256 _nullifierHash,
        address payable[4] calldata _recipients
    ) external {
        require(isKnownRoot(_root), "Invalid or expired Merkle root");
        require(!nullifierSpent[_nullifierHash], "Nullifier already spent (double-spending prevented)");

        // Prepare public signals expected by Groth16Verifier:
        // [root, nullifierHash, recipient[0], recipient[1], recipient[2], recipient[3]]
        uint256[6] memory pubSignals;
        pubSignals[0] = _root;
        pubSignals[1] = _nullifierHash;

        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            require(_recipients[i] != address(0), "Invalid recipient address (zero address)");
            pubSignals[2 + i] = uint256(uint160(address(_recipients[i])));
        }

        // Verify the ZK proof
        require(verifier.verifyProof(_pA, _pB, _pC, pubSignals), "Invalid Zero-Knowledge proof");

        // Mark nullifier as spent to prevent double-spending
        nullifierSpent[_nullifierHash] = true;

        // Transfer (denomination / 4) to each of the 4 recipients
        uint256 payoutPerRecipient = denomination / SPLIT_COUNT;
        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            (bool success, ) = _recipients[i].call{value: payoutPerRecipient}("");
            require(success, "Payment to recipient failed");
        }

        address[4] memory finalRecipients = [
            address(_recipients[0]),
            address(_recipients[1]),
            address(_recipients[2]),
            address(_recipients[3])
        ];

        emit WithdrawSplit(_nullifierHash, finalRecipients, payoutPerRecipient, msg.sender);
    }
}
