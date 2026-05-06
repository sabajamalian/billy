export type OcrItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type OcrParseResult = {
  items: OcrItem[];
  taxCents: number;
  tipCents: number;
  subtotalCents: number;
  totalCents: number;
  currency: string;
};

export type OcrRun = {
  provider: string;
  model: string;
  ok: boolean;
  result?: OcrParseResult;
  error?: string;
};

export type VotedItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  confidence: number;
  flagged: boolean;
};

export type VotedBill = {
  items: VotedItem[];
  taxCents: number;
  tipCents: number;
  subtotalCents: number;
  totalCents: number;
  votedItemsTotalCents: number;
  subtotalMismatch: boolean;
  subtotalMismatchDetail: {
    itemsTotalCents: number;
    subtotalCents: number;
    toleranceCents: number;
  };
  successfulRunCount: number;
  totalRunCount: number;
};

export type VotingOptions = {
  quorum?: (n: number) => number;
  toleranceCents?: number;
  toleranceFraction?: number;
  priceProximityFraction?: number;
};

type SuccessfulRun = OcrRun & { result: OcrParseResult };

type ExpandedItem = {
  runIndex: number;
  name: string;
  unitPriceCents: number;
};

type Cluster = {
  entries: ExpandedItem[];
};

type ReconciledCluster = {
  name: string;
  unitPriceCents: number;
  confidence: number;
  flagged: boolean;
};

const DEFAULT_TOLERANCE_CENTS = 50;
const DEFAULT_TOLERANCE_FRACTION = 0.01;
const DEFAULT_PRICE_PROXIMITY_FRACTION = 0.05;
const UNMATCHED_COST = 1;
const FORBIDDEN_COST = 1_000_000_000;

export function voteOcr(runs: OcrRun[], options: VotingOptions = {}): VotedBill {
  const successfulRuns = runs.filter(isSuccessfulRun);
  const successfulRunCount = successfulRuns.length;
  const toleranceCents = options.toleranceCents ?? DEFAULT_TOLERANCE_CENTS;
  const toleranceFraction = options.toleranceFraction ?? DEFAULT_TOLERANCE_FRACTION;
  const priceProximityFraction = options.priceProximityFraction ?? DEFAULT_PRICE_PROXIMITY_FRACTION;

  if (successfulRunCount === 0) {
    return emptyVotedBill(runs.length, toleranceCents);
  }

  const quorum = options.quorum?.(successfulRunCount) ?? Math.ceil(successfulRunCount / 2);
  const expandedRuns = successfulRuns.map((run, runIndex) => expandRunItems(run, runIndex));
  const clusters = buildClusters(expandedRuns, priceProximityFraction);
  const votedClusters = clusters
    .map((cluster) => reconcileCluster(cluster, successfulRunCount))
    .filter((cluster): cluster is ReconciledCluster => cluster !== undefined && cluster.confidence * successfulRunCount >= quorum);

  const items = mergeClusterItems(votedClusters, successfulRunCount === 1);
  const taxCents = median(successfulRuns.map((run) => run.result.taxCents));
  const tipCents = median(successfulRuns.map((run) => run.result.tipCents));
  const subtotalCents = median(successfulRuns.map((run) => run.result.subtotalCents));
  const totalCents = median(successfulRuns.map((run) => run.result.totalCents));
  const votedItemsTotalCents = items.reduce(
    (total, item) => total + item.unitPriceCents * item.quantity,
    0,
  );
  const resolvedToleranceCents = Math.max(
    toleranceCents,
    Math.ceil(toleranceFraction * Math.abs(subtotalCents)),
  );
  const subtotalMismatch = Math.abs(votedItemsTotalCents - subtotalCents) > resolvedToleranceCents;

  return {
    items,
    taxCents,
    tipCents,
    subtotalCents,
    totalCents,
    votedItemsTotalCents,
    subtotalMismatch,
    subtotalMismatchDetail: {
      itemsTotalCents: votedItemsTotalCents,
      subtotalCents,
      toleranceCents: resolvedToleranceCents,
    },
    successfulRunCount,
    totalRunCount: runs.length,
  };
}

function isSuccessfulRun(run: OcrRun): run is SuccessfulRun {
  return run.ok === true && run.result !== undefined;
}

function emptyVotedBill(totalRunCount: number, toleranceCents: number): VotedBill {
  return {
    items: [],
    taxCents: 0,
    tipCents: 0,
    subtotalCents: 0,
    totalCents: 0,
    votedItemsTotalCents: 0,
    subtotalMismatch: false,
    subtotalMismatchDetail: {
      itemsTotalCents: 0,
      subtotalCents: 0,
      toleranceCents,
    },
    successfulRunCount: 0,
    totalRunCount,
  };
}

function expandRunItems(run: SuccessfulRun, runIndex: number): ExpandedItem[] {
  return run.result.items.flatMap((item) => {
    const quantity = Math.max(1, Math.trunc(item.quantity));
    return Array.from({ length: quantity }, () => ({
      runIndex,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
    }));
  });
}

function buildClusters(expandedRuns: ExpandedItem[][], priceProximityFraction: number): Cluster[] {
  let clusters = expandedRuns[0]?.map((item) => ({ entries: [item] })) ?? [];

  for (const runItems of expandedRuns.slice(1)) {
    const costs = clusters.map((cluster) =>
      runItems.map((item) => clusterItemCost(cluster, item, priceProximityFraction)),
    );
    const matches = minCostOptionalMatching(costs);
    const matchedItemIndexes = new Set<number>();

    for (const [clusterIndex, itemIndex] of matches) {
      clusters[clusterIndex]?.entries.push(runItems[itemIndex]!);
      matchedItemIndexes.add(itemIndex);
    }

    const newClusters = runItems
      .filter((_, itemIndex) => !matchedItemIndexes.has(itemIndex))
      .map((item) => ({ entries: [item] }));
    clusters = clusters.concat(newClusters);
  }

  return clusters;
}

function clusterItemCost(cluster: Cluster, item: ExpandedItem, priceProximityFraction: number): number {
  const costs = cluster.entries
    .map((entry) => itemCost(entry, item, priceProximityFraction))
    .filter((cost) => Number.isFinite(cost));

  if (costs.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
}

function itemCost(a: ExpandedItem, b: ExpandedItem, priceProximityFraction: number): number {
  const nameSim = tokenSetJaccard(a.name, b.name);
  const priceDelta = Math.abs(a.unitPriceCents - b.unitPriceCents);
  const priceScale = Math.max(Math.abs(a.unitPriceCents), Math.abs(b.unitPriceCents), 1);
  const priceOk = priceDelta / priceScale <= priceProximityFraction;

  if (nameSim < 0.5 || !priceOk) {
    return Number.POSITIVE_INFINITY;
  }

  return 1 - nameSim;
}

function reconcileCluster(cluster: Cluster, successfulRunCount: number): ReconciledCluster | undefined {
  const votes = new Set(cluster.entries.map((entry) => entry.runIndex)).size;

  if (votes === 0) {
    return undefined;
  }

  const name = chooseName(cluster.entries.map((entry) => entry.name));
  const unitPriceCents = median(cluster.entries.map((entry) => entry.unitPriceCents));
  const confidence = votes / successfulRunCount;

  return {
    name,
    unitPriceCents,
    confidence,
    flagged: confidence < 1,
  };
}

function mergeClusterItems(clusters: ReconciledCluster[], forceFlagged: boolean): VotedItem[] {
  const groups = new Map<string, ReconciledCluster[]>();

  for (const cluster of clusters) {
    const key = `${cluster.name}\u0000${cluster.unitPriceCents}`;
    groups.set(key, [...(groups.get(key) ?? []), cluster]);
  }

  return Array.from(groups.values())
    .map((group) => ({
      name: group[0]!.name,
      quantity: group.length,
      unitPriceCents: group[0]!.unitPriceCents,
      confidence: Math.min(...group.map((cluster) => cluster.confidence)),
      flagged: forceFlagged || group.some((cluster) => cluster.flagged),
    }))
    .sort((a, b) => b.unitPriceCents - a.unitPriceCents || a.name.localeCompare(b.name));
}

function chooseName(names: string[]): string {
  return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ?? "";
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor((sorted.length - 1) / 2)]!);
}

function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenSetJaccard(a: string, b: string): number {
  const aTokens = new Set(normalizeName(a));
  const bTokens = new Set(normalizeName(b));

  if (aTokens.size === 0 && bTokens.size === 0) {
    return 1;
  }

  let intersectionSize = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = new Set([...aTokens, ...bTokens]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function minCostOptionalMatching(costs: number[][]): Array<[number, number]> {
  const leftCount = costs.length;
  const rightCount = costs[0]?.length ?? 0;

  if (leftCount === 0 || rightCount === 0) {
    return [];
  }

  const size = leftCount + rightCount;
  const matrix = Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) => {
      const isOriginalRow = rowIndex < leftCount;
      const isOriginalColumn = columnIndex < rightCount;

      if (isOriginalRow && isOriginalColumn) {
        const cost = costs[rowIndex]?.[columnIndex] ?? Number.POSITIVE_INFINITY;
        return Number.isFinite(cost) ? cost : FORBIDDEN_COST;
      }

      if (isOriginalRow || isOriginalColumn) {
        return UNMATCHED_COST;
      }

      return 0;
    }),
  );

  return hungarian(matrix)
    .map((columnIndex, rowIndex): [number, number] => [rowIndex, columnIndex])
    .filter(([rowIndex, columnIndex]) =>
      rowIndex < leftCount &&
      columnIndex < rightCount &&
      Number.isFinite(costs[rowIndex]?.[columnIndex]) &&
      (costs[rowIndex]?.[columnIndex] ?? FORBIDDEN_COST) < UNMATCHED_COST,
    );
}

function hungarian(matrix: number[][]): number[] {
  const size = matrix.length;
  const potentialsRows = Array(size + 1).fill(0) as number[];
  const potentialsColumns = Array(size + 1).fill(0) as number[];
  const matching = Array(size + 1).fill(0) as number[];
  const parent = Array(size + 1).fill(0) as number[];

  for (let row = 1; row <= size; row += 1) {
    matching[0] = row;
    let column = 0;
    const minv = Array(size + 1).fill(Number.POSITIVE_INFINITY) as number[];
    const used = Array(size + 1).fill(false) as boolean[];

    do {
      used[column] = true;
      const currentRow = matching[column]!;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;

      for (let candidateColumn = 1; candidateColumn <= size; candidateColumn += 1) {
        if (used[candidateColumn]) {
          continue;
        }

        const current = matrix[currentRow - 1]![candidateColumn - 1]! - potentialsRows[currentRow]! - potentialsColumns[candidateColumn]!;
        if (current < minv[candidateColumn]!) {
          minv[candidateColumn] = current;
          parent[candidateColumn] = column;
        }
        if (minv[candidateColumn]! < delta) {
          delta = minv[candidateColumn]!;
          nextColumn = candidateColumn;
        }
      }

      for (let candidateColumn = 0; candidateColumn <= size; candidateColumn += 1) {
        if (used[candidateColumn]) {
          potentialsRows[matching[candidateColumn]!] += delta;
          potentialsColumns[candidateColumn] -= delta;
        } else {
          minv[candidateColumn] -= delta;
        }
      }
      column = nextColumn;
    } while (matching[column] !== 0);

    do {
      const nextColumn = parent[column]!;
      matching[column] = matching[nextColumn]!;
      column = nextColumn;
    } while (column !== 0);
  }

  const assignment = Array(size).fill(-1) as number[];
  for (let column = 1; column <= size; column += 1) {
    assignment[matching[column]! - 1] = column - 1;
  }

  return assignment;
}
