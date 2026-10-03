// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPoseidon.sol";

abstract contract MerkleTreeWithHistory {
    uint32 public constant LEVELS = 8;
    uint32 public constant MAX_LEAVES = uint32(2**8); // 256
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    IPoseidon public immutable poseidonContract;

    uint32 public nextIndex = 0;
    uint32 public currentRootIndex = 0;

    // Filled subtrees at each level
    uint256[LEVELS] public filledSubtrees;

    // Precomputed empty tree node values at each level
    uint256[LEVELS + 1] public zeros;

    // Ring buffer of known roots
    uint256[ROOT_HISTORY_SIZE] public roots;

    constructor(address _poseidon) {
        poseidonContract = IPoseidon(_poseidon);

        // Precompute zero hashes for each level
        // zeros[0] = 0 (empty leaf)
        // zeros[i] = Poseidon(zeros[i-1], zeros[i-1])
        zeros[0] = 0;
        for (uint32 i = 1; i <= LEVELS; i++) {
            zeros[i] = _hashLeftRight(zeros[i - 1], zeros[i - 1]);
        }

        // Initialize filledSubtrees and initial root
        for (uint32 i = 0; i < LEVELS; i++) {
            filledSubtrees[i] = zeros[i];
        }
        roots[0] = zeros[LEVELS];
    }

    function _hashLeftRight(uint256 left, uint256 right) internal view returns (uint256) {
        uint256[2] memory input;
        input[0] = left;
        input[1] = right;
        return poseidonContract.poseidon(input);
    }

    function _insert(uint256 _leaf) internal returns (uint32 index) {
        index = nextIndex;
        require(index < MAX_LEAVES, "Merkle tree is full");

        uint256 currentLevelHash = _leaf;
        uint32 currentIndex = index;

        for (uint32 i = 0; i < LEVELS; i++) {
            if (currentIndex % 2 == 0) {
                filledSubtrees[i] = currentLevelHash;
                currentLevelHash = _hashLeftRight(currentLevelHash, zeros[i]);
            } else {
                currentLevelHash = _hashLeftRight(filledSubtrees[i], currentLevelHash);
            }
            currentIndex /= 2;
        }

        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        roots[currentRootIndex] = currentLevelHash;
        nextIndex = index + 1;
        return index;
    }

    function isKnownRoot(uint256 _root) public view returns (bool) {
        if (_root == 0) return false;
        for (uint32 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            if (roots[i] == _root) {
                return true;
            }
        }
        return false;
    }

    function getLastRoot() public view returns (uint256) {
        return roots[currentRootIndex];
    }
}
