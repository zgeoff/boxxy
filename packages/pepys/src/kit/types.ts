// The parts of the pepys kit API that this package binds to, copied in shape from the kit's source
// while the kit is not published. The kit's own types replace each one; the pepys package design
// doc lists which.

// one fact of a signed fact batch: the kit's `OutgoingFact` of the boxxy source
export interface WireFact {
  type: string;
  event: string;
  entity: `boxxy:item:${string}`;
  actor?: string | undefined;
  at: string;
  payload: Readonly<Record<string, unknown>>;
}

// `retry`: a 502, 503 or 504 answer, a timeout or no connection. `refused`: any other answer that
// is no success, 500 included.
export type SendFailure =
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'retry'; reason: string };

export type SendResult =
  | { ok: true; value: { stored: number } }
  | { ok: false; failure: SendFailure };

// the function that the kit's `createFactBatchSender` returns
export type FactBatchSend = (facts: readonly WireFact[]) => Promise<SendResult>;

export interface CostInput {
  item: string;
}

export interface StageTimeInput {
  item: string;
  environment: string;
}

// The kit's `PluginClient` of the plug-in: its two queries on the pepys API's RPC route. An answer
// is `unknown` until the reader's schema parses it.
export interface QueryClient {
  boxxy_cost_to_land: (input: CostInput) => Promise<unknown>;
  boxxy_stage_time: (input: StageTimeInput) => Promise<unknown>;
}
