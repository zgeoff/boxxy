import type {
  Fault,
  FrameItem,
  ItemId,
  LinkRow,
  PropagationLine,
  Resolved,
  SignalKey,
} from '@boxxy/model';
import { signalKey } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { compareItemIDs } from './compare-item-ids.ts';
import { formatFault } from './format-fault.ts';

interface PropagateInput {
  readonly lines: readonly PropagationLine[];
  readonly items: readonly FrameItem[];
  readonly links: readonly LinkRow[];
  readonly signals: ReadonlyMap<SignalKey, Resolved<'signal'>>;
  readonly values: ReadonlyMap<SignalKey, ReadonlyMap<ItemId, number>>;
}

interface Propagated {
  readonly values: Map<SignalKey, Map<ItemId, number>>;
  readonly faults: readonly Fault[];
}

export function propagate(input: PropagateInput): Propagated {
  const open = new Set(input.items.map((item) => item.id));

  const faults: Fault[] = [];

  const values = new Map(
    [...input.values].map(([key, byItem]): [SignalKey, Map<ItemId, number>] => [
      key,
      new Map(byItem),
    ]),
  );

  for (const line of input.lines) {
    const key = signalKey(line.value, {});
    const combine = getCombine(input.signals, key);

    try {
      const start = values.get(key) ?? new Map<ItemId, number>();

      values.set(key, carryLine(line, combine, start, { open, links: input.links }));
    } catch (error) {
      faults.push({
        plugin: `propagation:${line.value}:${line.over}`,
        kind: 'propagation',
        item: null,
        error: formatFault(error),
      });
    }
  }

  return { values, faults };
}

type Combine = (left: number, right: number) => number;

function getCombine(signals: PropagateInput['signals'], key: SignalKey): Combine {
  const combine = signals.get(key)?.open((plugin) => plugin.combine);

  invariant(combine, `the loader refuses a propagation line whose signal ${key} has no combine`);

  return combine;
}

interface LineGraph {
  readonly open: ReadonlySet<ItemId>;
  readonly links: readonly LinkRow[];
}

function carryLine(
  line: PropagationLine,
  combine: Combine,
  start: ReadonlyMap<ItemId, number>,
  graph: LineGraph,
): Map<ItemId, number> {
  const next = collectNeighbours(line, graph.links);

  const carried = new Map(start);

  const starts = [...start].toSorted(([left], [right]) => compareItemIDs(left, right));

  for (const [origin, value] of starts) {
    const visited = new Set([origin]);

    const queue = [...(next.get(origin) ?? [])];

    while (queue.length > 0) {
      const reached = queue.shift();

      if (reached === undefined || visited.has(reached) || !graph.open.has(reached)) {
        continue;
      }

      visited.add(reached);

      const current = carried.get(reached);
      const combined = current === undefined ? value : combine(current, value);

      carried.set(reached, combined);
      queue.push(...(next.get(reached) ?? []));
    }
  }

  return carried;
}

function collectNeighbours(
  line: PropagationLine,
  links: readonly LinkRow[],
): Map<ItemId, ItemId[]> {
  const next = new Map<ItemId, ItemId[]>();

  for (const link of links.filter((candidate) => candidate.type === line.over)) {
    const [from, to] =
      line.toward === 'source' ? [link.target, link.source] : [link.source, link.target];

    const neighbours = next.get(from) ?? [];

    neighbours.push(to);
    next.set(from, neighbours);
  }

  return next;
}
