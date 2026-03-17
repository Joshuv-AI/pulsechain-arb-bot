/**
 * Graph Builder
 * Builds a token liquidity graph from pools discovered by the scanner
 */

import { LiquidityGraph, PoolEdge } from './types';

export function buildGraph(pools: PoolEdge[]): LiquidityGraph {
  const graph: LiquidityGraph = {
    nodes: new Set(),
    edges: new Map()
  };

  for (const pool of pools) {
    // Add nodes
    graph.nodes.add(pool.tokenA);
    graph.nodes.add(pool.tokenB);

    // Initialize edge arrays if needed
    if (!graph.edges.has(pool.tokenA)) {
      graph.edges.set(pool.tokenA, []);
    }
    if (!graph.edges.has(pool.tokenB)) {
      graph.edges.set(pool.tokenB, []);
    }

    // Add edge in both directions (for undirected graph)
    graph.edges.get(pool.tokenA)!.push(pool);
    graph.edges.get(pool.tokenB)!.push(pool);
  }

  return graph;
}

/**
 * Add a single pool to existing graph
 */
export function addPoolToGraph(graph: LiquidityGraph, pool: PoolEdge): void {
  graph.nodes.add(pool.tokenA);
  graph.nodes.add(pool.tokenB);

  if (!graph.edges.has(pool.tokenA)) {
    graph.edges.set(pool.tokenA, []);
  }
  if (!graph.edges.has(pool.tokenB)) {
    graph.edges.set(pool.tokenB, []);
  }

  graph.edges.get(pool.tokenA)!.push(pool);
  graph.edges.get(pool.tokenB)!.push(pool);
}

/**
 * Remove a pool from graph
 */
export function removePoolFromGraph(graph: LiquidityGraph, poolAddress: string): void {
  for (const [token, edges] of graph.edges.entries()) {
    const filtered = edges.filter(e => e.address !== poolAddress);
    graph.edges.set(token, filtered);
  }
}

/**
 * Get all pools for a token
 */
export function getPoolsForToken(graph: LiquidityGraph, token: TokenAddress): PoolEdge[] {
  return graph.edges.get(token) || [];
}

/**
 * Get graph statistics
 */
export function getGraphStats(graph: LiquidityGraph): {
  nodeCount: number;
  edgeCount: number;
  avgConnections: number;
} {
  let totalEdges = 0;
  for (const edges of graph.edges.values()) {
    totalEdges += edges.length;
  }

  return {
    nodeCount: graph.nodes.size,
    edgeCount: totalEdges / 2, // Each pool counted twice (bidirectional)
    avgConnections: graph.nodes.size > 0 ? totalEdges / graph.nodes.size : 0
  };
}
