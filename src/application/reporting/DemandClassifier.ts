export const DEMAND_LEVELS = ['HIGH', 'NORMAL', 'LOW'] as const;
export type DemandLevel = (typeof DEMAND_LEVELS)[number];

export interface DemandThresholds {
  readonly highUtilisation: number;
  readonly highDenials: number;
  readonly lowUtilisation: number;
}

export interface DemandSignals {
  readonly peakUtilisation: number;
  readonly capacityDenials: number;
}

const RANK: Record<DemandLevel, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };

export function classifyDemand(signals: DemandSignals, thresholds: DemandThresholds): DemandLevel {
  if (
    signals.peakUtilisation >= thresholds.highUtilisation ||
    signals.capacityDenials >= thresholds.highDenials
  ) {
    return 'HIGH';
  }
  if (signals.peakUtilisation < thresholds.lowUtilisation) {
    return 'LOW';
  }
  return 'NORMAL';
}

export function compareDemand(
  left: DemandSignals & { readonly demandLevel: DemandLevel; readonly name: string },
  right: DemandSignals & { readonly demandLevel: DemandLevel; readonly name: string },
): number {
  return (
    RANK[left.demandLevel] - RANK[right.demandLevel] ||
    right.peakUtilisation - left.peakUtilisation ||
    right.capacityDenials - left.capacityDenials ||
    left.name.localeCompare(right.name)
  );
}
