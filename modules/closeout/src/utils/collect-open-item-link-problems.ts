import type { CloseOutContext, CloseOutProblem, DesignOpenItem, LinkEnd } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { collectOpenItemLinks } from './collect-open-item-links.ts';
import { getOpenItemRef } from './get-open-item-ref.ts';

const blocksType = brandSchemas.relationTypeName.parse('blocks');

// A link names the designed item or the key of another open item of the close-out, and the links
// make no loop: a loop of `blocks` relations holds each of its items for good.
export function collectOpenItemLinkProblems(
  openItems: readonly DesignOpenItem[],
  ctx: CloseOutContext,
): CloseOutProblem[] {
  const keys = openItems.flatMap((openItem) => (openItem.key === undefined ? [] : [openItem.key]));

  const known = new Set(['item', ...keys]);

  const named = openItems.flatMap((openItem, index) =>
    [...(openItem.blocks ?? []), ...(openItem.blockedBy ?? [])].map((ref) => ({
      own: getOpenItemRef(openItem, index),
      ref,
    })),
  );

  const links = collectOpenItemLinks(openItems);

  const loop = findLoop(
    buildNextRefs(links.map((link) => [toRef(link.from), toRef(link.to)] as const)),
  );

  return [
    ...collectRepeatedKeys(keys).map((key) =>
      buildPhaseRule(`the close-out gives more than one open item the key ${key}`),
    ),
    ...named
      .filter((entry) => !known.has(entry.ref))
      .map((entry) =>
        buildPhaseRule(
          `an open item names ${entry.ref}, which is neither \`item\` nor the key of an open item`,
        ),
      ),
    ...named
      .filter((entry) => entry.ref === entry.own)
      .map((entry) => buildPhaseRule(`the open item ${entry.own} names itself`)),
    ...(links.length > 0 && !ctx.world.relationTypes.has(blocksType)
      ? [
          {
            kind: 'refused-relation' as const,
            type: blocksType,
            target: 'item',
            reason: 'unknown-type' as const,
          },
        ]
      : []),
    ...(loop === null
      ? []
      : [buildPhaseRule(`the open items' blocks links make a loop: ${loop.join(' → ')}`)]),
  ];
}

// The first loop found, as its refs in order with the first repeated at the end.
function findLoop(next: ReadonlyMap<string, readonly string[]>): string[] | null {
  const done = new Set<string>();

  const visit = (ref: string, path: readonly string[]): string[] | null => {
    const at = path.indexOf(ref);

    if (at !== -1) {
      return [...path.slice(at), ref];
    }

    if (done.has(ref)) {
      return null;
    }

    for (const target of next.get(ref) ?? []) {
      const found = visit(target, [...path, ref]);

      if (found !== null) {
        return found;
      }
    }

    done.add(ref);

    return null;
  };

  for (const start of next.keys()) {
    const found = visit(start, []);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

// A self link is a problem of its own, so it is no loop here.
function buildNextRefs(edges: readonly (readonly [string, string])[]): Map<string, string[]> {
  const next = new Map<string, string[]>();

  for (const [from, to] of edges) {
    if (from !== to) {
      next.set(from, [...(next.get(from) ?? []), to]);
    }
  }

  return next;
}

function toRef(end: LinkEnd): string {
  return end.kind === 'item' ? 'item' : end.key;
}

function collectRepeatedKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
}

function buildPhaseRule(message: string): CloseOutProblem {
  return { kind: 'phase-rule', message };
}
