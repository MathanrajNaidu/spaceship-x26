# Spaceship X26 — Passenger Resource Management System

Crew leads manage passengers and ship resources. Passengers discover what their membership tier allows and start or end a usage session. The system checks tier, status and capacity at the moment of the request, keeps an append-only audit trail, and reports how the ship is actually being used.

## Quick start

Requires Node.js 24 (`nvm use`).

```bash
npm ci
npm test
npm run dev
```

The API listens on `http://127.0.0.1:4317` unless `PORT` or `HOST` is set.

## Try it in the browser

Run `npm run dev`, then open http://127.0.0.1:4317/docs. Authorize with `X-Actor-Id` set to a seeded id such as `crew-ada` or `pas-jonah`. The raw document is at `/openapi.json`.

| Script                  | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Run the API with a reload on change                  |
| `npm run build`         | Compile to `dist/`                                   |
| `npm start`             | Run the compiled server                              |
| `npm test`              | Vitest                                               |
| `npm run test:coverage` | Vitest with the domain and application coverage gate |
| `npm run lint`          | ESLint and Prettier                                  |
| `npm run typecheck`     | `tsc --noEmit`                                       |

Seeded crew leads (send `X-Actor-Id`):

| Id          | Name        |
| ----------- | ----------- |
| `crew-ada`  | Ada Okonkwo |
| `crew-bao`  | Bao Chen    |
| `crew-mira` | Mira Santos |

Demo passengers (set `SEED_DEMO_PASSENGERS=false` to skip them):

| Id          | Name       | Tier     |
| ----------- | ---------- | -------- |
| `pas-jonah` | Jonah Hale | SILVER   |
| `pas-priya` | Priya Nair | GOLD     |
| `pas-elena` | Elena Voss | PLATINUM |

The base inventory is seeded as well (`res-food-1`, `res-sleep-1`, `res-cabin-1`, `res-lux-o2-1`, `res-vip-1`, and the rest of the type list). Data is in memory and is gone after a restart.

### Docker

```bash
docker build -t spaceship-x26-prms .
docker run --rm -p 4317:4317 spaceship-x26-prms
```

The image binds `0.0.0.0:4317`. Locally the process binds `127.0.0.1`.

### Configuration

| Variable                  | Default               | Notes                                                                                          |
| ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `PORT`                    | `4317`                |                                                                                                |
| `HOST`                    | `127.0.0.1`           | Set to `0.0.0.0` in the container                                                              |
| `LOG_LEVEL`               | `info`                | `silent` turns logging off                                                                     |
| `SEED_DEMO_PASSENGERS`    | on                    | Only the string `false` disables demo passengers                                               |
| `CREW_LEADS`              | the three leads above | JSON array of `{ "id", "name" }`. Any count other than 3, or a duplicate id, stops the process |
| `DEMAND_HIGH_UTILISATION` | `0.8`                 | Peak utilisation at or above this is HIGH                                                      |
| `DEMAND_HIGH_DENIALS`     | `3`                   | Capacity denials at or above this are HIGH                                                     |
| `DEMAND_LOW_UTILISATION`  | `0.2`                 | Peak utilisation below this is LOW, unless denials already made it HIGH                        |

## API

Base path `/api/v1`. Send `X-Actor-Id`. Lists use `?limit=&offset=` (default 50, max 200) and return `{ data, page: { limit, offset, total } }`. Errors look like:

```json
{ "error": { "code": "TIER_ACCESS_DENIED", "message": "...", "requestId": "..." } }
```

Time windows are half-open: `from` is inclusive, `to` is exclusive. `from` later than `to` is `400 INVALID_TIME_RANGE`.

```bash
# Liveness. No actor header.
curl -s http://127.0.0.1:4317/api/v1/health

# Crew roster.
curl -s http://127.0.0.1:4317/api/v1/crew-leads -H 'X-Actor-Id: crew-ada'

# Create, list, read and rename a passenger.
curl -s -X POST http://127.0.0.1:4317/api/v1/passengers \
  -H 'X-Actor-Id: crew-ada' -H 'Content-Type: application/json' \
  -d '{"name":"Jonah Hale","tier":"SILVER"}'
curl -s 'http://127.0.0.1:4317/api/v1/passengers?tier=SILVER&status=ACTIVE' -H 'X-Actor-Id: crew-ada'
curl -s http://127.0.0.1:4317/api/v1/passengers/pas-jonah -H 'X-Actor-Id: crew-ada'
curl -s -X PATCH http://127.0.0.1:4317/api/v1/passengers/pas-jonah \
  -H 'X-Actor-Id: crew-ada' -H 'Content-Type: application/json' \
  -d '{"name":"Jonah Hale"}'

# Discover, start, list and end a session. A silver passenger is denied the luxury pod.
curl -s http://127.0.0.1:4317/api/v1/me -H 'X-Actor-Id: pas-jonah'
curl -s http://127.0.0.1:4317/api/v1/me/resources -H 'X-Actor-Id: pas-jonah'
curl -s -D - -X POST http://127.0.0.1:4317/api/v1/me/sessions \
  -H 'X-Actor-Id: pas-jonah' -H 'Content-Type: application/json' \
  -d '{"resourceId":"res-food-1"}'
curl -s -X POST http://127.0.0.1:4317/api/v1/me/sessions \
  -H 'X-Actor-Id: pas-jonah' -H 'Content-Type: application/json' \
  -d '{"resourceId":"res-lux-o2-1"}'
curl -s 'http://127.0.0.1:4317/api/v1/me/sessions?status=active' -H 'X-Actor-Id: pas-jonah'
curl -s -X POST http://127.0.0.1:4317/api/v1/me/sessions/SESSION_ID/end -H 'X-Actor-Id: pas-jonah'

# A crew lead can end any session.
curl -s -X POST http://127.0.0.1:4317/api/v1/sessions/SESSION_ID/end -H 'X-Actor-Id: crew-mira'

# Downgrade. Sessions the new tier cannot use are ended and returned.
curl -s -X PUT http://127.0.0.1:4317/api/v1/passengers/pas-elena/tier \
  -H 'X-Actor-Id: crew-ada' -H 'Content-Type: application/json' \
  -d '{"tier":"SILVER"}'

# Deactivate a passenger (ends their sessions) and decommission a free resource.
curl -s -X POST http://127.0.0.1:4317/api/v1/passengers/pas-jonah/deactivate -H 'X-Actor-Id: crew-bao'
curl -s -X POST http://127.0.0.1:4317/api/v1/resources \
  -H 'X-Actor-Id: crew-ada' -H 'Content-Type: application/json' \
  -d '{"name":"Spare Galley","type":"FOOD_STATION","capacity":4}'
curl -s http://127.0.0.1:4317/api/v1/resources -H 'X-Actor-Id: crew-ada'
curl -s http://127.0.0.1:4317/api/v1/resources/res-food-1 -H 'X-Actor-Id: crew-ada'
curl -s -X POST http://127.0.0.1:4317/api/v1/resources/res-food-2/decommission -H 'X-Actor-Id: crew-ada'

# History, reports and the audit log.
curl -s 'http://127.0.0.1:4317/api/v1/me/history?from=2026-06-01T00:00:00.000Z&to=2026-07-01T00:00:00.000Z' \
  -H 'X-Actor-Id: pas-priya'
curl -s http://127.0.0.1:4317/api/v1/passengers/pas-elena/history -H 'X-Actor-Id: crew-ada'
curl -s http://127.0.0.1:4317/api/v1/reports/usage-by-tier -H 'X-Actor-Id: crew-ada'
curl -s http://127.0.0.1:4317/api/v1/reports/resource-demand -H 'X-Actor-Id: crew-ada'
curl -s http://127.0.0.1:4317/api/v1/reports/active-usage -H 'X-Actor-Id: crew-ada'
curl -s 'http://127.0.0.1:4317/api/v1/audit-log?outcome=DENIED' -H 'X-Actor-Id: crew-ada'
```

## Architecture

Dependencies point inward: `http` → `application` → `domain`. `infrastructure` implements the ports. ESLint `import/no-restricted-paths` enforces that. `src/compositionRoot.ts` is the only place that wires concrete classes.

```
src/
  domain/          tiers, roster, passenger, resource, session, audit entry, access policy, events, errors
  application/     ports, authorizer, services, reporting, subscribers, keyed mutex
  infrastructure/  in-memory repositories, event bus, clock, ids, config, seed, logger
  http/            Express app, zod schemas, controllers, presenters, error mapping
```

A start-usage request runs through request id, actor resolution and zod, then `UsageService.startUsage`. That method takes a per-resource lock, checks the resource and the passenger, asks `TierAccessPolicy` for a decision, rejects a duplicate or a full resource, saves the session, and publishes `UsageStarted`. A denial publishes `UsageDenied` before the error is thrown. `AuditLogSubscriber` appends the entry before the response is sent.

### Where SOLID shows up

- **Single responsibility.** `Passenger` enforces its own invariants. `TierAccessPolicy` only decides access. `AuditLogSubscriber` only records events. Controllers translate HTTP. Presenters shape JSON.
- **Open/closed.** A new access rule is another `AccessPolicy` combined in `CompositeAccessPolicy`, without editing `UsageService`. A new side effect is another event subscriber. A new tier is one line in `MembershipTier`.
- **Liskov.** In-memory repositories and a future database adapter share one contract suite. `FakeClock` and `SystemClock` are interchangeable.
- **Interface segregation.** `AuditLogRepository` has `append` and `query` only. Reporting depends on `UsageSessionReader`, not the full repository.
- **Dependency inversion.** Services take ports. `createApp(deps)` takes its collaborators as arguments, which is what makes the HTTP tests possible.

### Patterns that earn their place

Repository, strategy (`AccessPolicy` returns a decision with a reason, not a boolean), observer (synchronous in-process events), static factories, composition root, and presenters. A DI container, CQRS and a generic base repository were left out on purpose. Membership is an ordered value object, not a class hierarchy, because a passenger's tier changes at runtime.

Services are grouped by area (`PassengerService`, `ResourceService`, `UsageService`, `ReportingService`). That is easier to navigate than one class per use case at this size.

## Assumptions

1. `X-Actor-Id` stands in for authentication. Missing, unknown or inactive is `401`. The wrong role is `403`.
2. Crew leads are seeded. There is no endpoint to create or delete one. The process refuses to start unless there are exactly three unique ids.
3. Passengers are created by crew leads and are never hard-deleted. Deactivation is a soft delete.
4. A resource has a capacity of at least 1. A passenger may hold at most one active session per resource, and may use several resources at once.
5. Every start is validated against current state. Nothing is cached.
6. `startUsage` and session end run under a per-resource mutex so two requests cannot take the last slot.
7. A downgrade ends sessions on resources the new tier cannot use (`TIER_DOWNGRADED`) and audits each one. An upgrade does not touch sessions. The same tier is `409 TIER_UNCHANGED`.
8. Decommissioning a resource that still has sessions is `409 RESOURCE_IN_USE`. Crew end those sessions first. Decommission is terminal, and history can still resolve the resource.
9. Deactivating a passenger ends their sessions (`PASSENGER_DEACTIVATED`). An inactive passenger cannot authenticate and cannot change tier.
10. Sessions stay open until someone ends them.
11. Each session stores `tierAtStart`. Later tier changes do not rewrite history.
12. Ids and time are injected. Production ids are UUIDs. Tests use `pas-1`, `res-1`, `ses-1`.
13. The base inventory and the demo passengers are seeded at boot.
14. Restarting the process drops all data.

## Trade-offs

- In-memory storage keeps the submission self-contained. The repository contracts are the seam a database adapter would have to pass.
- Header auth is explicit and easy to replace behind `ActorResolver`.
- The event bus is synchronous and awaited, so the audit row exists before the response. That is reliability over decoupling.
- The mutex is about twenty lines. A database would use a transaction and a row lock instead.
- Four services, not a use-case class per endpoint. Split one if it grows past a handful of operations.

## Testing

Unit tests cover the domain, the tier truth table, peak concurrency and demand classification. Application tests use in-memory repositories, `FakeClock` and `SequentialIdGenerator`. HTTP tests use supertest, including one mission scenario that walks all three levels.

Coverage is gated at 90% lines, branches, functions and statements on `src/domain/**` and `src/application/**`. HTTP glue is not chased. CI runs lint, typecheck and `npm run test:coverage`.

Notable cases: five parallel starts on a capacity-1 resource yield one success and four `CAPACITY_EXCEEDED`; a downgrade ends only the sessions that became inaccessible; a tier denial is both `403` and a `DENIED` audit entry; a tier report keeps usage under `tierAtStart`.

## Changes from the design document

- The process defaults to port `4317` on `127.0.0.1`. The design did not name a port. The container sets `HOST=0.0.0.0`.
- A Dockerfile is included. The design listed it under later work.
- Extra error codes: `INVALID_RESOURCE_TYPE`, `INVALID_NAME`, `INVALID_TIMESTAMP`, `INVALID_TIME_RANGE`, and `413 PAYLOAD_TOO_LARGE`.
- `GET /crew-leads` returns `{ data }` without a page, because the set is fixed at three.
- The audit log records every domain event, including admin changes and denied starts (tier, capacity, decommissioned, duplicate session, inactive passenger). A start against a missing resource is not audited.
- Windows are `[from, to)`. History and the tier report filter on `startedAt`. Demand peak uses overlap of that window. Capacity denials are audit entries whose reason is `CAPACITY_EXCEEDED`. Current utilisation is live occupancy, not windowed.
- Tier-report `passengerCount` is the distinct passengers on sessions with that `tierAtStart`. An empty report still returns all three tiers. Top resources are the three with the greatest duration. History totals include every resource type, zeros included. The daily trend lists only days that have sessions, in UTC.
- Demand sorts HIGH, then NORMAL, then LOW, then peak utilisation, then denials, then name. Thresholds are environment variables.
- A zero-length session does not raise the peak: at one timestamp the sweep applies the end before the start.
- If a resource is decommissioned and also above the passenger's tier, the status error wins (`409 RESOURCE_DECOMMISSIONED`).
- Ids are allocated after validation, so a rejected create does not consume an id.
- Request lines are written with pino from a small middleware. `pino-http` is not used, so `X-Request-Id` stays owned by one middleware.
- The active-usage snapshot lists `ACTIVE` resources only. Demand includes decommissioned resources.
- `CompositeAccessPolicy` is implemented and tested. The composition root wires `TierAccessPolicy`, which is the only rule this submission uses.

## What I'd do with more time

- A Postgres adapter that passes the existing repository contract suite, with a transaction instead of the in-process mutex.
- JWT or OIDC behind `ActorResolver`, and rate limiting on session starts.
- A live activity stream for crew leads, fed by the same event bus.
- Atomic crew-lead replacement that keeps the roster at exactly three.
- A maximum session duration per resource type, and a queue for HIGH-demand resources.
- An outbox so the audit entry and the state change commit together.
- An OpenAPI document generated from the zod schemas.
- Capacity changes on a live resource, rejected when the new capacity is below occupancy, and a maintenance state.
- Metrics.

## AI Usage Disclosure

**Which AI tool did I use?**
Cursor, mainly its background (cloud) agents.

**Why Cursor?**

- Its agents work directly against a Git repository on a branch and open pull requests, which fit my plan to deliver one reviewable PR per level.
- They run the test suite, linter and type checker as they work, which suits a test-first workflow and kept every commit green.
- It understands the whole codebase rather than single files, so changes followed the established layering and conventions.
- I could run work in the background and review the results as PRs, the same way I review a teammate's work.

**How did I use it?**

1. I wrote and agreed the design first (`DESIGN.md`): the domain model, layering, patterns, error model, assumptions and a commit-by-commit build order.
2. Cursor agents implemented the design level by level, test-first, in small conventional commits.
3. I reviewed each level's PR for correctness against the brief, SOLID and OOP design, readability, and test quality, and requested changes where needed (for example, fixing CI formatting and adding OpenAPI docs).

**Which parts were AI-assisted?**

- AI-generated, then reviewed by me: most of the production code, the tests, the CI workflow, the Dockerfile and the OpenAPI document.
- Mine: the overall architecture and design choices, how I read ambiguous requirements (listed under Assumptions and Open Questions), the trade-offs, and the final review of everything submitted.

**Workflow and prompts**
I gave the agents `DESIGN.md` plus the challenge brief, with these instructions: build to the design one level at a time, write tests before implementation, keep commits small and conventional, and keep lint, typecheck and tests passing in CI. I own the final solution and can walk through any part of it.
