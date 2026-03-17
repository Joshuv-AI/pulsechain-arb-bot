import { simulateSinglePathProfit } from "./scenarioRunner";

async function main() {
  const sim = simulateSinglePathProfit({
    amountIn: "100000",
    reserveIn: "700000",
    reserveOut: "1000000",
    sellPriceUSD: 1.0
  });

  console.log("simulation result:", sim);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
