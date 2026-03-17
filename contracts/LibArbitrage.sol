// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title LibArbitrage
 * @dev Math helpers for arbitrage calculations
 */
library LibArbitrage {
    uint256 constant FEE_DENOMINATOR = 10000;
    uint256 constant WAD = 1e18;

    /**
     * @dev Calculate output amount for Uniswap V2 style swap
     * @param amountIn Amount of input token
     * @param reserveIn Reserve of input token
     * @param reserveOut Reserve of output token
     * @param feeBps Fee in basis points (e.g., 30 = 0.3%)
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 feeBps
    ) internal pure returns (uint256) {
        require(amountIn > 0, "IN_AMOUNT_ZERO");
        require(reserveIn > 0, "RESERVE_IN_ZERO");
        require(reserveOut > 0, "RESERVE_OUT_ZERO");

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeBps);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;

        return numerator / denominator;
    }

    /**
     * @dev Calculate input amount needed for desired output
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 feeBps
    ) internal pure returns (uint256) {
        require(amountOut > 0, "OUT_AMOUNT_ZERO");
        require(reserveIn > 0, "RESERVE_IN_ZERO");
        require(reserveOut > 0, "RESERVE_OUT_ZERO");

        uint256 numerator = reserveIn * amountOut * FEE_DENOMINATOR;
        uint256 denominator = (reserveOut - amountOut) * (FEE_DENOMINATOR - feeBps);

        return (numerator / denominator) + 1;
    }

    /**
     * @dev Calculate profit after arbitrage trade
     */
    function calculateProfit(
        uint256 initialCapital,
        uint256 finalCapital,
        uint256 gasCost
    ) internal pure returns (int256) {
        return int256(finalCapital) - int256(initialCapital) - int256(gasCost);
    }
}
