import { describe, expect, it } from 'vitest';

import {
  classifyDemand,
  compareDemand,
  type DemandThresholds,
} from '../../src/application/reporting/DemandClassifier.js';

const thresholds: DemandThresholds = {
  highUtilisation: 0.8,
  highDenials: 3,
  lowUtilisation: 0.2,
};

describe('classifyDemand', () => {
  it('marks high utilisation or repeated denials as high, and idle use as low', () => {
    expect(classifyDemand({ peakUtilisation: 1, capacityDenials: 0 }, thresholds)).toBe('HIGH');
    expect(classifyDemand({ peakUtilisation: 0.8, capacityDenials: 0 }, thresholds)).toBe('HIGH');
    expect(classifyDemand({ peakUtilisation: 0, capacityDenials: 3 }, thresholds)).toBe('HIGH');
    expect(classifyDemand({ peakUtilisation: 0, capacityDenials: 0 }, thresholds)).toBe('LOW');
    expect(classifyDemand({ peakUtilisation: 0.19, capacityDenials: 2 }, thresholds)).toBe('LOW');
    expect(classifyDemand({ peakUtilisation: 0.2, capacityDenials: 2 }, thresholds)).toBe('NORMAL');
    expect(classifyDemand({ peakUtilisation: 0.5, capacityDenials: 0 }, thresholds)).toBe('NORMAL');
  });

  it('sorts high, then normal, then low, and breaks ties by utilisation, denials and name', () => {
    const rows = [
      { name: 'Zulu', demandLevel: 'LOW' as const, peakUtilisation: 0, capacityDenials: 0 },
      { name: 'Mike', demandLevel: 'HIGH' as const, peakUtilisation: 0.9, capacityDenials: 1 },
      { name: 'Alpha', demandLevel: 'NORMAL' as const, peakUtilisation: 0.4, capacityDenials: 2 },
      { name: 'Bravo', demandLevel: 'NORMAL' as const, peakUtilisation: 0.4, capacityDenials: 2 },
      { name: 'Nova', demandLevel: 'HIGH' as const, peakUtilisation: 0.9, capacityDenials: 4 },
    ];
    expect(rows.sort(compareDemand).map((row) => row.name)).toEqual([
      'Nova',
      'Mike',
      'Alpha',
      'Bravo',
      'Zulu',
    ]);
  });
});
