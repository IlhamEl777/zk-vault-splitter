// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPoseidon {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}
