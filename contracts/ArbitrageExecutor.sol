// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArbitrageExecutor
 * @dev Main contract for executing arbitrage trades
 */
contract ArbitrageExecutor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    
    // Slippage tolerance in basis points (10000 = 100%)
    uint256 public slippageTolerance = 200; // 2%
    
    // Minimum profit threshold in USD (to cover gas)
    uint256 public minProfitThreshold = 100e18; // 100 USD
    
    // Maximum flashloan size
    uint256 public maxFlashloanSize = 1_000_000e18;
    
    // Authorized executors
    mapping(address => bool) public authorizedExecutors;
    
    // Pool addresses for swaps
    struct PoolRoute {
        address tokenIn;
        address tokenOut;
        address pool;
        bool isActive;
    }
    
    PoolRoute[] public poolRoutes;
    
    // Events
    event TradeExecuted(
        address indexed executor,
        uint256 profit,
        uint256 gasUsed,
        bytes path
    );
    
    event PoolRouteAdded(
        address tokenIn,
        address tokenOut,
        address pool
    );
    
    event ParametersUpdated(
        uint256 newSlippage,
        uint256 newMinProfit
    );

    // ============ Constructor ============
    
    constructor() {
        authorizedExecutors[msg.sender] = true;
    }

    // ============ Admin Functions ============
    
    function setSlippageTolerance(uint256 _slippage) external onlyOwner {
        require(_slippage <= 5000, "Slippage too high"); // Max 50%
        slippageTolerance = _slippage;
        emit ParametersUpdated(slippageTolerance, minProfitThreshold);
    }
    
    function setMinProfitThreshold(uint256 _threshold) external onlyOwner {
        minProfitThreshold = _threshold;
        emit ParametersUpdated(slippageTolerance, minProfitThreshold);
    }
    
    function setAuthorizedExecutor(address _executor, bool _status) external onlyOwner {
        authorizedExecutors[_executor] = _status;
    }
    
    function addPoolRoute(
        address _tokenIn,
        address _tokenOut,
        address _pool
    ) external onlyOwner {
        poolRoutes.push(PoolRoute({
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            pool: _pool,
            isActive: true
        }));
        emit PoolRouteAdded(_tokenIn, _tokenOut, _pool);
    }

    // ============ Flashloan Logic ============
    
    /**
     * @dev Execute arbitrage with flashloan
     * @param _token Token to borrow
     * @param _amount Amount to borrow
     * @param _path Encoded swap path: [tokenIn, pool1, tokenOut, pool2, ...]
     * @param _minProfit Minimum profit expected
     */
    function executeArbitrage(
        address _token,
        uint256 _amount,
        bytes calldata _path,
        uint256 _minProfit
    ) external nonReentrant {
        require(authorizedExecutors[msg.sender], "Not authorized");
        require(_amount <= maxFlashloanSize, "Amount too large");
        
        // Transfer flashloan tokens to this contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        
        // Execute the arbitrage path
        (uint256 received, uint256 gasBefore) = _executePath(_token, _amount, _path);
        
        // Calculate profit
        uint256 profit = received > _amount ? received - _amount : 0;
        
        require(profit >= _minProfit, "Profit below threshold");
        require(profit >= minProfitThreshold, "Profit below min threshold");
        
        // Return remaining to executor
        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(_token).safeTransfer(msg.sender, balance);
        }
        
        emit TradeExecuted(msg.sender, profit, gasBefore, _path);
    }

    /**
     * @dev Internal function to execute swap path
     * Override this to implement custom swap logic
     */
    function _executePath(
        address _tokenIn,
        uint256 _amountIn,
        bytes calldata _path
    ) internal virtual returns (uint256 received, uint256 gasBefore) {
        gasBefore = gasleft();
        
        // Decode path: [tokenIn, pool1, tokenOut, pool2, ...]
        // This is a placeholder - implement based on specific DEXes
        // For now, just return the input (no swap)
        
        return (_amountIn, gasBefore);
    }

    // ============ Emergency Functions ============
    
    function emergencyWithdraw(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(_token).safeTransfer(owner(), balance);
        }
    }
    
    receive() external payable {}
}
