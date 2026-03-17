// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interfaces/IFlashLoanProvider.sol";
import "./interfaces/IERC20.sol";

contract MockFlashLoanProvider is IFlashLoanProvider {
    address public token;

    constructor(address _token) {
        token = _token;
    }

    function flashLoan(address receiver, address tokenAddr, uint256 amount, bytes calldata params) external override {
        require(tokenAddr == token, "token mismatch");
        IERC20(tokenAddr).transfer(receiver, amount);
        (bool ok, ) = receiver.call(
            abi.encodeWithSignature("onFlashLoan(address,uint256,bytes)", msg.sender, amount, params)
        );
        require(ok, "callback failed");
    }
}
