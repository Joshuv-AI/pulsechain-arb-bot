import { ethers } from "ethers";
import config from "./config";
import { getPairReserves } from "./getPairReserves";
import { sleep } from "./util";
import { saveSnapshot } from "./poolStore";

async function main() {
  const provider = new ethers.JsonRpcProvider(config.RPC_PULSECHAIN as string);
  const pairs = config.TARGET_PAIRS;
  if (!pairs.length) {
    console.error("No TARGET_PAIRS configured. Set TARGET_PAIRS in env or config.");
    process.exit(1);
  }
  console.log("Scanner started. Pairs:", pairs.length);

  while (true) {
    const ts = Date.now();
    await Promise.all(
      pairs.map(async (pair) => {
        try {
          const r = await getPairReserves(provider, pair);
          await saveSnapshot({
            pair,
            token0: r.token0,
            token1: r.token1,
            reserve0: r.reserve0,
            reserve1: r.reserve1,
            timestamp: ts
          });
        } catch (e) {
          console.error("pair read err", pair, (e as Error).message);
        }
      })
    );
    console.log(new Date(ts).toISOString(), "snapshots saved");
    await sleep(Number(config.SCAN_INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
