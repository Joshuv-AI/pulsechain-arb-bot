// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/IFlashLoanProvider.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FlashExecutor is ReentrancyGuard {
    address public owner;
    IFlashLoanProvider public lender;

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _lender) {
        owner = msg.sender;
        lender = IFlashLoanProvider(_lender);
    }

    function executeFlashloan(address token, uint256 amount, bytes calldata params) external onlyOwner {
        lender.flashLoan(address(this), token, amount, params);
    }

    function onFlashLoan(address provider, uint256 amount, bytes calldata params) external returns (bool) {
        require(msg.sender == address(provider), "bad provider");
        // Decode params if needed: routers, swap paths, minProfit etc.
        // Implement swap logic here
        return true;
    }

    function withdraw(address token, address to) external onlyOwner {
        IERC20(token).transfer(to, IERC20(token).balanceOf(address(this)));
    }
}
