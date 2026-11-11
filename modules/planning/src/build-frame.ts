import type {
  Fault,
  FilterField,
  Frame,
  FrameItem,
  FrameValues,
  Hold,
  Instant,
  ItemId,
  ItemKindName,
  KindRules,
  Lift,
  LoadedRules,
  PlanContext,
  Resolved,
  SignalKey,
  SliceOneSnapshot as Snapshot,
  Waiver,
} from '@boxxy/model';
import { signalKey } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { formatFault } from './format-fault.ts';
import { propagate } from './propagate.ts';

interface BuildFrameInput {
  readonly snapshot: Snapshot;
  readonly rules: LoadedRules;
  readonly now: Instant;
}

export function buildFrame(input: BuildFrameInput): Frame {
  const items = collectFrameItems(input.snapshot, input.rules.kinds);
  const candidates = items.filter((item) => item.derived.state === 'ready');

  const buildContext = (values: FrameValues): PlanContext => ({
    now: input.now,
    levers: input.snapshot.levers,
    relations: input.snapshot.relations,
    values,
  });

  const carriedKeys = new Set(input.rules.propagation.map((line) => signalKey(line.value, {})));

  const carried = [...carriedKeys].map((key) =>
    collectSignalValues(key, getSignal(input.rules, key), items, buildContext(new Map())),
  );

  const propagated = propagate({
    lines: input.rules.propagation,
    items,
    relations: input.snapshot.relations,
    signals: input.rules.signals,
    values: new Map(carried.map((entry) => [entry.key, entry.values])),
  });

  const others = [...input.rules.signals]
    .filter(([key]) => !carriedKeys.has(key))
    .map(([key, signal]) =>
      collectSignalValues(key, signal, candidates, buildContext(propagated.values)),
    );

  const values = new Map([
    ...propagated.values,
    ...others.map((entry): [SignalKey, Map<ItemId, number>] => [entry.key, entry.values]),
  ]);

  const context = buildContext(values);
  const waivers = [...input.rules.registry.waiver.values()];
  const gated = candidates.map((item) => collectHolds(item, input.rules.gates, waivers, context));
  const filterFields = [...input.rules.registry['filter-field'].values()];
  const fields = candidates.map((item) => collectFieldValues(item, filterFields));

  return {
    candidates,
    fields: new Map(fields.map((entry) => [entry.item, entry.values])),
    values,
    holds: new Map(
      gated.flatMap((entry) => (entry.holds.length > 0 ? [[entry.item, entry.holds]] : [])),
    ),
    lifted: new Map(
      gated.flatMap((entry) => (entry.lifted.length > 0 ? [[entry.item, entry.lifted]] : [])),
    ),
    faults: [
      ...carried.flatMap((entry) => entry.faults),
      ...propagated.faults,
      ...others.flatMap((entry) => entry.faults),
      ...gated.flatMap((entry) => entry.faults),
      ...fields.flatMap((entry) => entry.faults),
    ],
  };
}

function collectFrameItems(
  snapshot: Snapshot,
  kinds: ReadonlyMap<ItemKindName, KindRules>,
): FrameItem[] {
  return snapshot.items.flatMap((item) => {
    const phase = kinds.get(item.kind)?.pipeline.steps[0]?.phase;

    return phase === undefined ? [] : [{ ...item, phase }];
  });
}

interface SignalValues {
  readonly key: SignalKey;
  readonly values: Map<ItemId, number>;
  readonly faults: readonly Fault[];
}

function collectSignalValues(
  key: SignalKey,
  signal: Resolved<'signal'>,
  items: readonly FrameItem[],
  context: PlanContext,
): SignalValues {
  const values = new Map<ItemId, number>();

  const faults: Fault[] = [];

  for (const item of items) {
    try {
      const value = signal.open((plugin, params) => plugin.value(item, context, params));

      if (value !== null) {
        values.set(item.id, value);
      }
    } catch (error) {
      faults.push({
        plugin: signal.name,
        kind: 'signal',
        item: item.id,
        error: formatFault(error),
      });
    }
  }

  return { key, values, faults };
}

function getSignal(rules: LoadedRules, key: SignalKey): Resolved<'signal'> {
  const signal = rules.signals.get(key);

  invariant(signal, `the loader resolves the signal of each propagation line, and missed ${key}`);

  return signal;
}

interface ItemHolds {
  readonly item: ItemId;
  readonly holds: Hold[];
  readonly lifted: Lift[];
  readonly faults: readonly Fault[];
}

function collectHolds(
  item: FrameItem,
  gates: readonly Resolved<'gate'>[],
  waivers: readonly Waiver[],
  context: PlanContext,
): ItemHolds {
  const outcomes = gates.map((gate) => pickGateOutcome(item, gate, context));
  const faults = outcomes.flatMap((outcome) => outcome.faults);
  const holds: Hold[] = [];
  const lifted: Lift[] = [];

  for (const outcome of outcomes) {
    if (outcome.hold !== null) {
      const waived = outcome.liftable
        ? pickLift(item, outcome.hold, waivers, context)
        : { lift: null, faults: [] };

      faults.push(...waived.faults);

      if (waived.lift === null) {
        holds.push(outcome.hold);
      } else {
        lifted.push(waived.lift);
      }
    }
  }

  return { item: item.id, holds, lifted, faults };
}

interface GateOutcome {
  readonly hold: Hold | null;
  readonly liftable: boolean;
  readonly faults: readonly Fault[];
}

function pickGateOutcome(
  item: FrameItem,
  gate: Resolved<'gate'>,
  context: PlanContext,
): GateOutcome {
  try {
    return gate.open((plugin, params) => ({
      hold: plugin.hold(item, context, params),
      liftable: plugin.liftable,
      faults: [],
    }));
  } catch (error) {
    const message = formatFault(error);

    return {
      hold: { gate: gate.name, reason: message },
      liftable: false,
      faults: [{ plugin: gate.name, kind: 'gate', item: item.id, error: message }],
    };
  }
}

interface Waived {
  readonly lift: Lift | null;
  readonly faults: readonly Fault[];
}

function pickLift(
  item: FrameItem,
  hold: Hold,
  waivers: readonly Waiver[],
  context: PlanContext,
): Waived {
  const faults: Fault[] = [];

  for (const waiver of waivers.filter((candidate) => candidate.lifts === hold.gate)) {
    try {
      const lift = waiver.lift(item, hold, context);

      if (lift !== null) {
        return { lift, faults };
      }
    } catch (error) {
      faults.push({
        plugin: waiver.name,
        kind: 'waiver',
        item: item.id,
        error: formatFault(error),
      });
    }
  }

  return { lift: null, faults };
}

interface FieldValues {
  readonly item: ItemId;
  readonly values: Readonly<Record<string, readonly string[]>>;
  readonly faults: readonly Fault[];
}

function collectFieldValues(item: FrameItem, fields: readonly FilterField[]): FieldValues {
  const values: Record<string, readonly string[]> = {};
  const faults: Fault[] = [];

  for (const field of fields) {
    try {
      const value = field.value(item);

      if (value !== null) {
        values[field.name] = typeof value === 'string' ? [value] : value;
      }
    } catch (error) {
      faults.push({
        plugin: field.name,
        kind: 'filter-field',
        item: item.id,
        error: formatFault(error),
      });
    }
  }

  return { item: item.id, values, faults };
}
