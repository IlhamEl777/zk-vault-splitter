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

    // Timelock Escrow structures for Stealth Staggered & Randomized Split
    struct ScheduledPayout {
        address payable recipient;
        uint256 amount;
        uint256 releaseTime;
        bool executed;
    }

    struct SplitBatch {
        bytes32 batchId;
        uint256 nullifierHash;
        uint256 totalAmount;
        uint256 createdAt;
        ScheduledPayout[4] payouts;
        bool completed;
    }

    mapping(bytes32 => SplitBatch) public splitBatches;
    bytes32[] public activeBatchIds;

    event Deposit(uint256 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event WithdrawSplit(
        uint256 indexed nullifierHash,
        address[4] recipients,
        uint256 amountPerRecipient,
        address relayer
    );
    event ScheduledSplitCreated(
        bytes32 indexed batchId,
        uint256 indexed nullifierHash,
        address[4] recipients,
        uint256[4] amounts,
        uint256[4] releaseTimes,
        address relayer
    );
    event ScheduledPayoutDispatched(
        bytes32 indexed batchId,
        uint256 indexed slotIndex,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
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
     * @notice Withdraw and split vault denomination into 4 recipient wallets using a valid ZK proof (Instant 25% each).
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

    /**
     * @notice Withdraw and split vault denomination into 4 recipient wallets with custom/random amounts and scheduled timelock delays.
     * @dev Proof is verified, nullifier is spent, amounts validated (sum == denomination), and payouts are placed in Timelock Escrow.
     * @param _pA Groth16 proof A
     * @param _pB Groth16 proof B
     * @param _pC Groth16 proof C
     * @param _root Merkle tree root
     * @param _nullifierHash Hash of nullifier
     * @param _recipients 4 recipient addresses
     * @param _amounts 4 specific payout amounts (must sum exactly to denomination)
     * @param _delays 4 delays in seconds from current block.timestamp
     */
    function withdrawScheduledSplit(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256 _root,
        uint256 _nullifierHash,
        address payable[4] calldata _recipients,
        uint256[4] calldata _amounts,
        uint256[4] calldata _delays
    ) external returns (bytes32 batchId) {
        require(isKnownRoot(_root), "Invalid or expired Merkle root");
        require(!nullifierSpent[_nullifierHash], "Nullifier already spent (double-spending prevented)");

        // 1. Validate total amounts sum exactly to denomination
        uint256 totalSum = 0;
        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            require(_amounts[i] > 0, "Payout amount must be greater than 0");
            totalSum += _amounts[i];
        }
        require(totalSum == denomination, "Total amounts must equal vault denomination");

        // 2. Prepare public signals expected by Groth16Verifier:
        // [root, nullifierHash, recipient[0], recipient[1], recipient[2], recipient[3]]
        uint256[6] memory pubSignals;
        pubSignals[0] = _root;
        pubSignals[1] = _nullifierHash;

        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            require(_recipients[i] != address(0), "Invalid recipient address (zero address)");
            pubSignals[2 + i] = uint256(uint160(address(_recipients[i])));
        }

        // 3. Verify Groth16 ZK proof
        require(verifier.verifyProof(_pA, _pB, _pC, pubSignals), "Invalid Zero-Knowledge proof");

        // 4. Mark nullifier as spent immediately to prevent double spending
        nullifierSpent[_nullifierHash] = true;

        // 5. Create Batch ID
        batchId = keccak256(abi.encodePacked(_nullifierHash, block.timestamp, msg.sender));

        SplitBatch storage batch = splitBatches[batchId];
        batch.batchId = batchId;
        batch.nullifierHash = _nullifierHash;
        batch.totalAmount = denomination;
        batch.createdAt = block.timestamp;

        address[4] memory finalRecipients;
        uint256[4] memory finalReleaseTimes;

        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            uint256 releaseTime = block.timestamp + _delays[i];
            batch.payouts[i] = ScheduledPayout({
                recipient: _recipients[i],
                amount: _amounts[i],
                releaseTime: releaseTime,
                executed: false
            });
            finalRecipients[i] = address(_recipients[i]);
            finalReleaseTimes[i] = releaseTime;

            // If delay is 0, execute immediately!
            if (_delays[i] == 0) {
                batch.payouts[i].executed = true;
                (bool success, ) = _recipients[i].call{value: _amounts[i]}("");
                require(success, "Payment to recipient failed");
                emit ScheduledPayoutDispatched(batchId, i, address(_recipients[i]), _amounts[i], block.timestamp);
            }
        }

        // Check if all were 0-delay (completed right away)
        bool allDone = true;
        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            if (!batch.payouts[i].executed) {
                allDone = false;
                break;
            }
        }
        batch.completed = allDone;

        activeBatchIds.push(batchId);

        emit ScheduledSplitCreated(
            batchId,
            _nullifierHash,
            finalRecipients,
            _amounts,
            finalReleaseTimes,
            msg.sender
        );
    }

    /**
     * @notice Execute a single scheduled payout slot once its timelock has expired.
     * @dev Can be called by the relayer keeper, the recipient, or any party.
     * @param _batchId The unique batch ID
     * @param _slotIndex The recipient slot index (0 to 3)
     */
    function executeScheduledPayout(bytes32 _batchId, uint256 _slotIndex) external {
        require(_slotIndex < SPLIT_COUNT, "Invalid slot index");
        SplitBatch storage batch = splitBatches[_batchId];
        require(batch.createdAt > 0, "Batch does not exist");
        ScheduledPayout storage payout = batch.payouts[_slotIndex];

        require(!payout.executed, "Payout slot already executed");
        require(block.timestamp >= payout.releaseTime, "Payout timelock not yet expired");

        payout.executed = true;
        (bool success, ) = payout.recipient.call{value: payout.amount}("");
        require(success, "Payment to recipient failed");

        // Check if all slots in batch are now executed
        bool allDone = true;
        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            if (!batch.payouts[i].executed) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            batch.completed = true;
        }

        emit ScheduledPayoutDispatched(_batchId, _slotIndex, address(payout.recipient), payout.amount, block.timestamp);
    }

    struct PayoutView {
        address recipient;
        uint256 amount;
        uint256 releaseTime;
        bool executed;
        int256 secondsRemaining;
    }

    /**
     * @notice View helper to inspect all 4 payouts in a scheduled batch.
     */
    function getBatchPayouts(bytes32 _batchId) external view returns (PayoutView[4] memory views, bool completed) {
        SplitBatch storage batch = splitBatches[_batchId];
        require(batch.createdAt > 0, "Batch does not exist");
        completed = batch.completed;
        for (uint256 i = 0; i < SPLIT_COUNT; i++) {
            ScheduledPayout storage p = batch.payouts[i];
            int256 remaining = int256(p.releaseTime) - int256(block.timestamp);
            if (p.executed || remaining < 0) {
                remaining = 0;
            }
            views[i] = PayoutView({
                recipient: address(p.recipient),
                amount: p.amount,
                releaseTime: p.releaseTime,
                executed: p.executed,
                secondsRemaining: remaining
            });
        }
    }

    /**
     * @notice Returns total number of registered batches.
     */
    function getActiveBatchesCount() external view returns (uint256) {
        return activeBatchIds.length;
    }
}
