export type RiskDuplicates = 'both' | 'none';
export type RiskMissPoints = 0 | -10;
export const RISK_DUPLICATE_OPTIONS: readonly RiskDuplicates[] = ['both', 'none'];
export const RISK_MISS_OPTIONS: readonly RiskMissPoints[] = [0, -10];

export interface RiskRules {
  /** Gleicher Treffer im selben Durchgang: beide punkten oder beide gehen leer aus. */
  duplicates: RiskDuplicates;
  /** Punkte für einen Fehltipp oder keinen Tipp. */
  missPoints: RiskMissPoints;
}

export function isRiskDuplicates(x: unknown): x is RiskDuplicates {
  return (RISK_DUPLICATE_OPTIONS as readonly unknown[]).includes(x);
}

export function isRiskMissPoints(x: unknown): x is RiskMissPoints {
  return (RISK_MISS_OPTIONS as readonly unknown[]).includes(x);
}

/**
 * Punkte eines Durchgangs. Ein Treffer bringt so viele Punkte wie sein Platz,
 * ein Fehltipp oder fehlender Tipp (`undefined`) die Fehltipp-Punkte.
 */
export function scoreRiskPass(
  participants: readonly string[],
  ranks: Readonly<Record<string, number | null | undefined>>,
  rules: RiskRules,
): Record<string, number> {
  const hitsPerRank = new Map<number, number>();
  for (const id of participants) {
    const rank = ranks[id];
    if (rank != null) hitsPerRank.set(rank, (hitsPerRank.get(rank) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const id of participants) {
    const rank = ranks[id];
    if (rank == null) out[id] = rules.missPoints;
    else out[id] = rules.duplicates === 'none' && (hitsPerRank.get(rank) ?? 0) > 1 ? 0 : rank;
  }
  return out;
}
