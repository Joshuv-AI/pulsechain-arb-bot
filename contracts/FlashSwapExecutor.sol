// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/*
Production Flash Swap Arbitrage Executor
Designed for PulseChain / PulseX
Supports dynamic multi-hop arbitrage paths
*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IPulseXPair {
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

interface IPulseXRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
    
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract FlashSwapExecutor {
    
    address public owner;
    
    // Slippage tolerance (basis points)
    uint256 public slippageTolerance = 200; // 2%
    
    // Minimum profit threshold
    uint256 public minProfitThreshold = 10e18; // 10 USD worth
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    // Data structures for multi-hop arbitrage
    struct SwapStep {
        address router;
        address tokenIn;
        address tokenOut;
        uint256 minOut;
    }
    
    struct ArbData {
        SwapStep[] steps;
        address repayToken;
        uint256 repayAmount;
    }
    
    /*
    Entry point from orchestrator
    Initiates flash swap from PulseX pair
    */
    function executeFlashSwap(
        address pair,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external onlyOwner {
        IPulseXPair(pair).swap(
            amount0Out,
            amount1Out,
            address(this),
            data
        );
    }
    
    /*
    Flash swap callback
    PulseX pairs call this after tokens sent
    */
    function uniswapV2Call(
        address,
        uint256,
        uint256,
        bytes calldata data
    ) external {
        ArbData memory arb = abi.decode(data, (ArbData));
        
        executeArbitrage(arb);
        
        uint256 balance = IERC20(arb.repayToken).balanceOf(address(this));
        
        require(
            balance >= arb.repayAmount,
            "arbitrage not profitable"
        );
        
        IERC20(arb.repayToken).transfer(
            msg.sender,
            arb.repayAmount
        );
    }
    
    /*
    Executes multi-hop arbitrage path
    */
    function executeArbitrage(ArbData memory arb) internal {
        uint256 length = arb.steps.length;
        
        for (uint256 i = 0; i < length; i++) {
            SwapStep memory step = arb.steps[i];
            
            uint256 balance = IERC20(step.tokenIn).balanceOf(address(this));
            
            require(balance > 0, "no balance to swap");
            
            IERC20(step.tokenIn).approve(step.router, balance);
            
            address[] memory path = new address[](2);
            path[0] = step.tokenIn;
            path[1] = step.tokenOut;
            
            IPulseXRouter(step.router).swapExactTokensForTokens(
                balance,
                step.minOut,
                path,
                address(this),
                block.timestamp
            );
        }
    }
    
    /*
    Withdraw profit
    */
    function withdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }
    
    /*
    Withdraw native ETH
    */
    function withdrawETH(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }
    
    /*
    Update slippage tolerance
    */
    function setSlippageTolerance(uint256 _slippage) external onlyOwner {
        require(_slippage <= 5000, "slippage too high");
        slippageTolerance = _slippage;
    }
    
    /*
    Update min profit threshold
    */
    function setMinProfitThreshold(uint256 _threshold) external onlyOwner {
        minProfitThreshold = _threshold;
    }
    
    // Receive ETH
    receive() external payable {}
}
