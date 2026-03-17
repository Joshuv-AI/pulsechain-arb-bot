import { Contract, providers } from "ethers";

const UniswapV2PairABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

export async function getPairReserves(provider: providers.Provider, pairAddress: string) {
  const c = new Contract(pairAddress, UniswapV2PairABI, provider);
  const [reserve0, reserve1] = await c.getReserves();
  const token0 = await c.token0();
  const token1 = await c.token1();
  return {
    token0,
    token1,
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString()
  };
}
