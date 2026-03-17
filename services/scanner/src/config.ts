import dotenv from "dotenv";
dotenv.config();

export default {
  RPC_PULSECHAIN: process.env.RPC_PULSECHAIN || "http://localhost:8545",
  SCAN_INTERVAL_MS: Number(process.env.SCAN_INTERVAL_MS || 3000),
  TARGET_PAIRS: (process.env.TARGET_PAIRS || "").split(",").filter(Boolean)
};
