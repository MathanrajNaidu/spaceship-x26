import { expect, it } from 'vitest';

import type { AuditLogRepository } from '../../../src/application/ports/AuditLogRepository.js';
import { AuditEntry } from '../../../src/domain/audit/AuditEntry.js';

const T0 = new Date('2026-06-01T10:00:00.000Z');
const T1 = new Date('2026-06-01T11:00:00.000Z');
const T2 = new Date('2026-06-01T12:00:00.000Z');

function entry(
  id: string,
  occurredAt: Date,
  extras: Partial<{
    passengerId: string;
    resourceId: string;
    action: string;
    outcome: 'SUCCESS' | 'DENIED';
  }> = {},
): AuditEntry {
  return AuditEntry.record({
    id,
    occurredAt,
    actorId: 'crew-ada',
    actorRole: 'CREW_LEAD',
    action: extras.action ?? 'UsageStarted',
    outcome: extras.outcome ?? 'SUCCESS',
    passengerId: extras.passengerId,
    resourceId: extras.resourceId,
  });
}

export function describeAuditLogRepositoryContract(
  createRepository: () => AuditLogRepository,
): void {
  it('appends entries and does not expose a stored snapshot for mutation', async () => {
    const repository = createRepository();
    await repository.append(entry('aud-1', T0, { passengerId: 'pas-1', resourceId: 'res-1' }));
    const [first] = await repository.query({});
    expect(first?.id).toBe('aud-1');
    const snapshot = first?.toSnapshot();
    if (!snapshot) {
      throw new Error('expected entry');
    }
    await repository.append(AuditEntry.reconstitute({ ...snapshot, id: 'aud-copy' }));
    expect((await repository.query({})).map((item) => item.id)).toEqual(['aud-copy', 'aud-1']);
  });

  it('filters by passenger, resource, action, outcome and a half-open time window', async () => {
    const repository = createRepository();
    await repository.append(entry('aud-1', T0, { passengerId: 'pas-1', resourceId: 'res-1' }));
    await repository.append(
      entry('aud-2', T1, {
        passengerId: 'pas-1',
        resourceId: 'res-2',
        action: 'UsageDenied',
        outcome: 'DENIED',
      }),
    );
    await repository.append(entry('aud-3', T2, { passengerId: 'pas-2', resourceId: 'res-1' }));

    expect(
      (await repository.query({ passengerId: 'pas-1', resourceId: 'res-1' })).map(
        (item) => item.id,
      ),
    ).toEqual(['aud-1']);
    expect(
      (await repository.query({ action: 'UsageDenied', outcome: 'DENIED' })).map((item) => item.id),
    ).toEqual(['aud-2']);
    expect((await repository.query({ from: T0, to: T2 })).map((item) => item.id)).toEqual([
      'aud-2',
      'aud-1',
    ]);
    expect(await repository.query({ passengerId: 'pas-missing' })).toEqual([]);
    expect(await repository.query({ outcome: 'DENIED', from: T2 })).toEqual([]);
    await repository.append(entry('aud-b', T1, { passengerId: 'pas-9' }));
    await repository.append(entry('aud-a', T1, { passengerId: 'pas-9' }));
    expect((await repository.query({ passengerId: 'pas-9' })).map((item) => item.id)).toEqual([
      'aud-b',
      'aud-a',
    ]);
  });
}
