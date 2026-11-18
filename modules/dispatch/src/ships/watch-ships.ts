import type {
  AnyNewFact,
  Instant,
  ItemShipped,
  ItemWithLevers,
  RepoName,
  ShipRule,
  StoreReader,
} from '@boxxy/model';
import { brandSchemas, findMergeCommit, shippedWaitName } from '@boxxy/model';
import { memoize } from './memoize.ts';
import { pickCandidates } from './pick-candidates.ts';
import type { ShipReads } from './read-ship.ts';
import { readShip } from './read-ship.ts';
import type { ShipCandidate, ShipFinding, WatchShipsInput } from './types.ts';

// One pass of the ship watch, which runs whether or not the runner is paused. A forge call that
// throws writes nothing for the items that needed it, and the next pass reads again.
export async function watchShips(input: WatchShipsInput): Promise<ItemShipped[]> {
  const found = await input.store.read((reader) => readCandidates(reader, input));

  const candidates = pickCandidates(found, input.lastChecked, input.now);
  const reads = buildReads(input);
  const written: ItemShipped[] = [];

  for (const candidate of candidates) {
    const finding = await readOne(input, reads, candidate);

    if (finding === null) {
      continue;
    }

    const shipped: ItemShipped = {
      itemId: candidate.itemId,
      commit: candidate.commit,
      seenAt: input.now,
      ...finding,
    };

    const isWritten = await writeShipped(input, shipped);

    if (isWritten) {
      written.push(shipped);
    }
  }

  return written;
}

async function readCandidates(
  reader: StoreReader,
  input: WatchShipsInput,
): Promise<ShipCandidate[]> {
  const items = await reader.listItems({}, input.now, input.rules);

  const candidates: ShipCandidate[] = [];

  for (const item of items) {
    const rule = findWatchedRule(item, input);

    if (rule === null) {
      continue;
    }

    const detail = await reader.readItemDetail(item.id, input.now, input.rules);

    const commit = detail === null ? null : findMergeCommit(detail.attempts, detail.pullRequests);

    if (
      detail !== null &&
      commit !== null &&
      !detail.shipped.some((row) => row.commit === commit)
    ) {
      candidates.push({ itemId: item.id, repo: item.repo, commit, rule });
    }
  }

  return candidates;
}

// The ship rule of the item's own repo, when the item is one the watch reads: not held, not
// closed, in a repo the server serves, at a step that waits on `shipped`. A repo that ships
// nothing has nothing to read.
function findWatchedRule(
  item: ItemWithLevers,
  input: WatchShipsInput,
): Exclude<ShipRule, 'none'> | null {
  const position = item.position;
  const pipeline = input.rules.kinds.get(item.kind)?.pipeline;

  if (
    item.derived.state === 'held' ||
    item.derived.state === 'archived' ||
    position.kind !== 'phase' ||
    !input.spawnRepos.has(item.repo)
  ) {
    return null;
  }

  const step = pipeline?.steps.find((each) => each.phase === position.phase);
  const rule = input.rules.repos.get(item.repo)?.ships ?? 'none';

  return step?.waits?.includes(shippedWaitName) === true && rule !== 'none' ? rule : null;
}

function buildReads(input: WatchShipsInput): ShipReads {
  const forge = input.forge;

  const unreadable = new Set<RepoName>();

  return {
    readRepo: memoize((repo: RepoName) => forge.readRepo(repo)),
    readTag: memoize((repo: RepoName, tag: string) => forge.readTag(repo, tag)),
    listReleases: memoize((repo: RepoName) => forge.listReleases(repo)),
    findBumps: memoize((repo: RepoName, since: Instant) => forge.findBumps(repo, since)),
    contains: (repo, ref, commit) => forge.contains(repo, ref, commit),
    onUnreadable: (repo) => {
      if (!unreadable.has(repo)) {
        unreadable.add(repo);
        input.warn('the App cannot read a repo that a ships rule names', { repo });
      }
    },
  };
}

async function readOne(
  input: WatchShipsInput,
  reads: ShipReads,
  candidate: ShipCandidate,
): Promise<ShipFinding | null> {
  try {
    return await readShip({
      reads,
      repo: candidate.repo,
      commit: candidate.commit,
      rule: candidate.rule,
    });
  } catch (error) {
    input.warn('the forge did not answer the ship watch', {
      item: candidate.itemId,
      repo: candidate.repo,
      error: error instanceof Error ? error.message : 'a forge call threw',
    });

    return null;
  }
}

// The row and its fact in one change, unless a row for the item and commit exists already.
function writeShipped(input: WatchShipsInput, shipped: ItemShipped): Promise<boolean> {
  return input.store.exclusive(async (tx) => {
    const existing = await tx.listShipped(shipped.itemId);

    if (existing.some((row) => row.commit === shipped.commit)) {
      return false;
    }

    const fact: AnyNewFact = {
      id: brandSchemas.factId.parse(input.newId()),
      type: 'boxxy.item.shipped',
      entity: `boxxy:item:${shipped.itemId}`,
      actor: `boxxy:runner:${input.runner}`,
      payload: shipped,
    };

    const result = await tx.applyChange({
      at: input.now,
      writes: [{ op: 'insert', table: 'item_shipped', row: shipped }],
      facts: [fact],
    });

    return result.kind === 'applied';
  });
}
