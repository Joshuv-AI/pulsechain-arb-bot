/**
 * Path Finder
 * Explores possible swap routes using DFS
 */

import { LiquidityGraph, SwapPath, TokenAddress } from './types';

export function findPaths(
  graph: LiquidityGraph,
  startToken: TokenAddress,
  maxDepth: number = 4,
  excludeTokens: TokenAddress[] = []
): SwapPath[] {
  const results: SwapPath[] = [];

  function dfs(
    current: TokenAddress,
    visited: TokenAddress[],
    edges: SwapPath['edges']
  ): void {
    // Stop if we've reached max depth
    if (visited.length > maxDepth) return;

    // Get all edges from current token
    const currentEdges = graph.edges.get(current) || [];

    for (const edge of currentEdges) {
      // Determine next token
      const next = edge.tokenA === current ? edge.tokenB : edge.tokenA;

      // Skip if we've already visited this token (prevent loops except for return)
      if (visited.includes(next) && next !== startToken) continue;

      // Skip excluded tokens
      if (excludeTokens.includes(next)) continue;

      const newVisited = [...visited, next];
      const newEdges = [...edges, edge];

      // Only add path if it returns to start (cycle) or has reached max depth
      if (next === startToken && visited.length > 1) {
        results.push({
          tokens: newVisited,
          edges: newEdges
        });
      } else if (visited.length < maxDepth) {
        dfs(next, newVisited, newEdges);
      }
    }
  }

  // Start DFS from the initial token
  dfs(startToken, [startToken], []);

  return results;
}

/**
 * Find paths that start and end at the same token (cycles)
 */
export function findCycles(
  graph: LiquidityGraph,
  startToken: TokenAddress,
  maxDepth: number = 4
): SwapPath[] {
  const allPaths = findPaths(graph, startToken, maxDepth);
  
  return allPaths.filter(path => {
    const end = path.tokens[path.tokens.length - 1];
    return end === startToken && path.tokens.length >= 3;
  });
}

/**
 * Find all paths between two specific tokens
 */
export function findPathsBetween(
  graph: LiquidityGraph,
  fromToken: TokenAddress,
  toToken: TokenAddress,
  maxDepth: number = 4
): SwapPath[] {
  const results: SwapPath[] = [];

  function dfs(
    current: TokenAddress,
    visited: TokenAddress[],
    edges: SwapPath['edges']
  ): void {
    if (visited.length > maxDepth) return;

    if (current === toToken && visited.length > 1) {
      results.push({
        tokens: visited,
        edges
      });
      return;
    }

    const currentEdges = graph.edges.get(current) || [];

    for (const edge of currentEdges) {
      const next = edge.tokenA === current ? edge.tokenB : edge.tokenA;

      if (visited.includes(next)) continue;

      dfs(next, [...visited, next], [...edges, edge]);
    }
  }

  dfs(fromToken, [fromToken], []);

  return results;
}

/**
 * Find multi-hop paths starting from a token
 * Returns all paths up to maxDepth, not just cycles
 */
export function findAllPaths(
  graph: LiquidityGraph,
  startToken: TokenAddress,
  maxDepth: number = 4
): SwapPath[] {
  const results: SwapPath[] = [];

  function dfs(
    current: TokenAddress,
    visited: TokenAddress[],
    edges: SwapPath['edges']
  ): void {
    if (visited.length > maxDepth) return;

    // Add current path if it's long enough
    if (visited.length >= 3) {
      results.push({
        tokens: visited,
        edges: [...edges]
      });
    }

    const currentEdges = graph.edges.get(current) || [];

    for (const edge of currentEdges) {
      const next = edge.tokenA === current ? edge.tokenB : edge.tokenA;

      if (visited.includes(next)) continue;

      dfs(next, [...visited, next], [...edges, edge]);
    }
  }

  dfs(startToken, [startToken], []);

  return results;
}
