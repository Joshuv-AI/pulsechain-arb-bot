// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFlashLoanProvider {
    function flashLoan(address receiver, address token, uint256 amount, bytes calldata params) external;
}
