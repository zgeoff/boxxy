// boxxy pepys package, file 3 of 4: what boxxy reads back from pepys. Not compiled or type-checked.
//
//   A. The call sites: the server start, a report handler, a handler test with the fake.
//   B. The port            boxxy repo, libs/model/src/ports/types.ts (the build removes `CostReader`)
//   C. The pepys adapter   boxxy repo, packages/pepys/src/create-pepys-reader.ts
//   D. The fake            boxxy repo, libs/model/src/test-utils/create-fake-pepys-reader.ts
//
// The port is the one of ../edge/02-outbox.ts, section F: ONE port, `PepysReader`, with two
// methods, in the place of `CostReader` of the existing code. Its two value types, `CostToLand`
// and `StageTime`, are the outputs of the two queries (02-queries.ts, section B).

import type { ItemId } from '@boxxy/model';
import { costToLandSchema, stageTimeSchema } from '@boxxy/model'; // 02-queries.ts, section B
import type { CostToLand, StageTime } from '@boxxy/model';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { PluginClient } from '@pepys/kit';
import type { z } from 'zod';
import type { boxxyPlugin } from './01-package.ts';

// ── A. The call sites ──────────────────────────────────────────────────────────────────────────

// A1. apps/server/src/start-server.ts. The config holds `ingestUrl`, `apiOrigin` and
// `environment`: the stage-times query needs the environment whose deploy counts (such as
// `production`), and the reader takes it (../edge/02-outbox.ts, A1).
declare const config: { pepys: { ingestUrl: string; apiOrigin: string; environment: string } | null };

const pepys = config.pepys === null ? null : createPepysReader({ apiOrigin: config.pepys.apiOrigin, environment: config.pepys.environment });

// A2. apps/server/src/handlers/report-cost.ts — the handler of `report.cost` (../edge/01-api.ts, C5).
// The output is the query's output, whole, plus `behind`.
declare const context: { pepys: PepysReader | null; store: { readItemBehind: (item: ItemId) => Promise<{ facts: number; oldestAt: number | null }> } };
declare const errors: { PEPYS_NOT_CONFIGURED: () => Error; PEPYS_UNAVAILABLE: (options: { data: { reason: string } }) => Error };

async function reportCost(input: { item: ItemId }) {
  if (context.pepys === null) throw errors.PEPYS_NOT_CONFIGURED();

  const answer = await context.pepys.readCostToLand(input.item);

  if (answer.kind === 'unavailable') throw errors.PEPYS_UNAVAILABLE({ data: { reason: answer.reason } });

  // `item` is boxxy's own ID, as the contract has it (../edge/01-api.ts, C5); the value holds
  // the pepys entity ID
  return { ...answer.value, item: input.item, behind: await context.store.readItemBehind(input.item) };
}

// A3. apps/server/src/handlers/report-cost.test.ts — the fake.
const fake = createFakePepysReader();
declare const item: ItemId;

fake.set(item, { cost: buildMockCostToLand({ landedAt: null }) });
// reportCost({ item }) ─▶ { item, landedAt: null, …, behind: { facts: 0, oldestAt: null } }
fake.failNext('connection refused');
// reportCost({ item }) ─▶ throws PEPYS_UNAVAILABLE with the reason

declare function buildMockCostToLand(overrides: Partial<CostToLand>): CostToLand; // @boxxy/model/test-utils

void [pepys, reportCost];

// ── B. The port — libs/model/src/ports/types.ts ────────────────────────────────────────────────
//
// A port, because the two report handlers are tested with a fake (../edge/02-outbox.ts,
// section F, which declares the same port).

export interface PepysReader {
  // the query `boxxy_cost_to_land`
  readCostToLand: (item: ItemId) => Promise<PepysAnswer<CostToLand>>;
  // The query `boxxy_stage_time`. It takes the item alone: the environment is the adapter's.
  readStageTime: (item: ItemId) => Promise<PepysAnswer<StageTime>>;
}

export type PepysAnswer<Value> = { readonly kind: 'value'; readonly value: Value } | { readonly kind: 'unavailable'; readonly reason: string };

// What the port gives, for an item that pepys has no fact of yet (the outbox is behind, or the
// item is new): a `value`, with `attempts: 0`, no line, and seven steps with null minutes. That
// is not `unavailable`. The report's `behind` tells the owner why.
//
// ID and time forms.
//   - The port takes boxxy's bare `ItemId`. The queries take and return `boxxy:item:<id>`. The
//     adapter adds the prefix on the way in. `value.item` is the entity ID, as pepys wrote it;
//     the report handler puts boxxy's own ID back (A2).
//   - Times in both values are ISO 8601 strings, as pepys stores them, `endedAt` of a step among
//     them. The reports pass the values through, so the contract takes the string
//     (../edge/01-api.ts, C5).

// ── C. The pepys adapter — packages/pepys/src/create-pepys-reader.ts ───────────────────────────

// The client of this plug-in's queries, from their declarations. A type import only: the reader
// loads no query, and so no GitHub or telemetry plug-in code, into the boxxy server.
// `PluginClient<Plugin>` is the kit's type (`@pepys/kit`): the client of one plug-in's queries.
// This package declares no client type of its own.
type BoxxyClient = PluginClient<typeof boxxyPlugin>;

export function createPepysReader(options: { apiOrigin: string; environment: string }): PepysReader {
  // The pepys API serves every query at `/rpc`. No token in v1.
  // It mounts each plug-in query under its snake case name, so this link can call it.
  const client: BoxxyClient = createORPCClient(new RPCLink({ origin: options.apiOrigin, url: '/rpc' }));

  return {
    readCostToLand: (item) => ask(costToLandSchema, () => client.boxxy_cost_to_land({ item: toItemEntity(item) })),
    readStageTime: (item) => ask(stageTimeSchema, () => client.boxxy_stage_time({ item: toItemEntity(item), environment: options.environment })),
  };
}

function toItemEntity(item: ItemId): `boxxy:item:${string}` {
  return `boxxy:item:${item}`;
}

// One call, with a 10 second limit (the limit of the sink's send).
//   an answer that parses                    ─▶ value
//   SERVICE_UNAVAILABLE (a consumer the      ─▶ unavailable, with pepys's message, which names
//   query reads has no current version)         the consumers
//   any other error, a timeout, no           ─▶ unavailable, with the error's text
//   connection
//   an answer the schema refuses             ─▶ unavailable, 'pepys answered a shape this boxxy
//                                               does not know': the cloud repo runs another
//                                               version of this package than the boxxy server
// The adapter never throws and never retries: a report is a read that the owner can ask again.
declare function ask<Value>(schema: z.ZodType<Value>, call: () => Promise<unknown>): Promise<PepysAnswer<Value>>;

// ── D. The fake — libs/model/src/test-utils/create-fake-pepys-reader.ts ────────────────────────
//
// In `@boxxy/model`, not in this package: the handler tests in apps/server must not install the
// pepys packages to fake them. The shape is the one of ../edge/02-outbox.ts, section F.

export interface FakePepysReader extends PepysReader {
  // an item with no value set answers as pepys does for an unknown item: the empty value
  set: (item: ItemId, values: { cost?: CostToLand; stageTime?: StageTime }) => void;
  // the next call, of either method, answers `unavailable` with this reason; then values again
  failNext: (reason: string) => void;
}

export declare function createFakePepysReader(): FakePepysReader;

// One suite for both adapters, as `FactSink` has (../edge/02-outbox.ts, section C). The pepys
// adapter runs it against `createTestStore` (04-test.ts) behind an oRPC handler in the same
// process:
//   - an item with no fact gives the empty value, not `unavailable`
//   - a value that the schema refuses gives `unavailable`
//   - a store that is down gives `unavailable` with a reason, and does not throw
export declare function pepysReaderContract(make: () => Promise<{ reader: PepysReader; takeDown: () => Promise<void> }>): void;
