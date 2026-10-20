import type { UsageSession } from '../../domain/usage/UsageSession.js';

export function toSessionDto(session: UsageSession) {
  return {
    id: session.id,
    passengerId: session.passengerId,
    resourceId: session.resourceId,
    tierAtStart: session.tierAtStart.name,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason ?? null,
  };
}
