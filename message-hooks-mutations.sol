// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract report-simple {
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    function dummy() public pure returns (uint256) {
        return 42;
    }
}