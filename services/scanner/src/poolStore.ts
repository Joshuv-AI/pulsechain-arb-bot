type Snapshot = {
  pair: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  timestamp: number;
};

const STORE: Snapshot[] = [];

export async function saveSnapshot(s: Snapshot) {
  STORE.push(s);
  // In production persist to Postgres + index on pair+timestamp
}

export function latestForPair(pair: string): Snapshot | undefined {
  for (let i = STORE.length - 1; i >= 0; i--) {
    if (STORE[i].pair === pair) return STORE[i];
  }
  return undefined;
}
