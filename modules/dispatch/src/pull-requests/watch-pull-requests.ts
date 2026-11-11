import type {
  ActorRef,
  AnyNewFact,
  AttemptId,
  AttemptRow,
  PullRequestReading,
  PullRequestRef,
  PullRequestRow,
  RepoName,
  RowWrite,
  StoreTx,
} from '@boxxy/model';
import { brandSchemas, buildPhase } from '@boxxy/model';
import { buildLinkChange } from './build-link-change.ts';
import { buildStateFact } from './build-state-fact.ts';
import { collectAttemptTrailers } from './collect-attempt-trailers.ts';
import { collectSeenState } from './collect-seen-state.ts';
import { watchLimits } from './constants.ts';
import type { WatchPullRequestsInput, WatchReport } from './types.ts';

interface Tally {
  linked: number;
  commitsLinked: number;
  merged: number;
  closed: number;
  unanswered: number;
}

// One pass of the watch. It links the pull request of each succeeded build that the hook missed,
// then reads each open pull request to link its commits and record its merge or close. A forge
// call that throws counts in `unanswered` and writes nothing; the next pass tries again.
export async function watchPullRequests(input: WatchPullRequestsInput): Promise<WatchReport> {
  const tally: Tally = { linked: 0, commitsLinked: 0, merged: 0, closed: 0, unanswered: 0 };

  await linkMissed(input, tally);

  const watched = await input.store.read((reader) => reader.listWatchedPullRequests());

  for (const row of watched) {
    await watchOne(input, row, tally);
  }

  return tally;
}

async function linkMissed(input: WatchPullRequestsInput, tally: Tally): Promise<void> {
  const byRepo = await input.store.read(async (reader) => {
    const succeeded = await reader.listSucceededAttemptsWithoutPullRequest();
    const watched = await reader.listWatchedPullRequests();

    const busyItems = new Set<string>();

    for (const row of watched) {
      const owner = await reader.readAttempt(row.attempt);

      if (owner !== null) {
        busyItems.add(owner.item);
      }
    }

    const candidates = succeeded.filter(
      (attempt) =>
        attempt.phase === buildPhase &&
        !busyItems.has(attempt.item) &&
        input.now - (attempt.endedAt ?? attempt.claimedAt) <= watchLimits.linkWindowMs,
    );

    const grouped = new Map<RepoName, AttemptRow[]>();

    for (const attempt of candidates) {
      const item = await reader.readItem(attempt.item, input.now, input.rules);

      if (item !== null) {
        grouped.set(item.repo, [...(grouped.get(item.repo) ?? []), attempt]);
      }
    }

    return grouped;
  });

  for (const [repo, attempts] of byRepo) {
    await linkRepo(input, tally, repo, attempts);
  }
}

async function linkRepo(
  input: WatchPullRequestsInput,
  tally: Tally,
  repo: RepoName,
  attempts: readonly AttemptRow[],
): Promise<void> {
  const open = await askForge(tally, () => input.forge.listOpenPullRequests(repo));

  if (open === null) {
    return;
  }

  const readings = new Map<number, PullRequestReading | null>();
  const taken = new Set<number>();

  for (const attempt of attempts) {
    for (const ref of open.filter((candidate) => !taken.has(candidate.number))) {
      if (!readings.has(ref.number)) {
        const fresh = await readOpen(input, tally, ref);

        readings.set(ref.number, fresh);
      }

      const reading = readings.get(ref.number) ?? null;

      if (reading === null || !isMadeBy(reading, attempt.id)) {
        continue;
      }

      taken.add(ref.number);

      const isLinked = await writeLink(input, attempt, ref, reading);

      tally.linked += isLinked ? 1 : 0;
      break;
    }
  }
}

async function askForge<Answer>(tally: Tally, call: () => Promise<Answer>): Promise<Answer | null> {
  try {
    return await call();
  } catch {
    tally.unanswered += 1;

    return null;
  }
}

async function readOpen(
  input: WatchPullRequestsInput,
  tally: Tally,
  ref: PullRequestRef,
): Promise<PullRequestReading | null> {
  const reading = await askForge(tally, () => input.forge.readPullRequest(ref));

  return reading === null || reading === 'not-found' ? null : reading;
}

function isMadeBy(reading: PullRequestReading, attempt: AttemptId): boolean {
  return reading.commits.some((commit) => collectAttemptTrailers(commit.message).includes(attempt));
}

function writeLink(
  input: WatchPullRequestsInput,
  attempt: AttemptRow,
  ref: PullRequestRef,
  reading: PullRequestReading,
): Promise<boolean> {
  return input.store.exclusive(async (tx) => {
    const existing = await tx.readPullRequestRow(ref);

    if (existing !== null) {
      return false;
    }

    const result = await tx.applyChange(
      buildLinkChange({
        attempt,
        ref,
        reading,
        source: 'watch',
        actor: `boxxy:runner:${input.runner}`,
        now: input.now,
        newId: input.newId,
      }),
    );

    return result.kind === 'applied';
  });
}

async function watchOne(
  input: WatchPullRequestsInput,
  row: PullRequestRow,
  tally: Tally,
): Promise<void> {
  const ref = { repo: row.repo, number: row.number };

  const reading = await askForge(tally, () => input.forge.readPullRequest(ref));

  if (reading === null) {
    return;
  }

  await input.store.exclusive(async (tx) => {
    if (reading !== 'not-found') {
      await recordReading({ input, tx, row, reading, tally });
    }

    await tx.markPullRequestChecked(ref, input.now);
  });
}

interface RecordInput {
  readonly input: WatchPullRequestsInput;
  readonly tx: StoreTx;
  readonly row: PullRequestRow;
  readonly reading: PullRequestReading;
  readonly tally: Tally;
}

async function recordReading(record: RecordInput): Promise<void> {
  const input = record.input;
  const tx = record.tx;
  const row = record.row;

  const owner = await tx.readAttempt(row.attempt);

  if (owner === null) {
    return;
  }

  const actor: ActorRef = `boxxy:runner:${input.runner}`;
  const entity = `boxxy:item:${owner.item}` as const;
  const writes: RowWrite[] = [];
  const facts: AnyNewFact[] = [];

  const handled = new Set<string>();

  for (const commit of record.reading.commits) {
    for (const id of collectAttemptTrailers(commit.message)) {
      const key = `${id} ${commit.sha}`;

      if (handled.has(key)) {
        continue;
      }

      handled.add(key);

      const trailerAttempt = await tx.readAttempt(id);
      const evidence = await tx.listEvidence(id);

      const isNew =
        trailerAttempt?.item === owner.item &&
        !evidence.some((entry) => entry.kind === 'commit' && entry.ref === commit.sha);

      if (!isNew) {
        continue;
      }

      const factId = brandSchemas.factId.parse(input.newId());

      writes.push({
        op: 'insert',
        table: 'evidence',
        row: {
          factId,
          attempt: id,
          kind: 'commit',
          ref: commit.sha,
          observed: null,
          source: 'trailer',
          at: input.now,
        },
      });

      facts.push({
        id: factId,
        type: 'boxxy.commit.linked',
        entity,
        actor,
        payload: { attempt: id, repo: row.repo, sha: commit.sha, pullRequestNumber: row.number },
      });
    }
  }

  const commitCount = facts.length;
  const seenState = collectSeenState(record.reading);

  if (seenState.state !== 'open') {
    const stateFact = buildStateFact({
      row: { ...row, ...seenState },
      item: owner.item,
      actor,
      id: brandSchemas.factId.parse(input.newId()),
    });

    writes.push({
      op: 'update',
      table: 'pull_requests',
      key: { repo: row.repo, number: row.number },
      expect: { state: 'open' },
      set: { ...seenState, checkedAt: input.now },
    });

    if (stateFact !== null) {
      facts.push(stateFact);
    }
  }

  if (writes.length === 0) {
    return;
  }

  const result = await tx.applyChange({ at: input.now, writes, facts });

  if (result.kind === 'applied') {
    record.tally.commitsLinked += commitCount;
    record.tally.merged += seenState.state === 'merged' ? 1 : 0;
    record.tally.closed += seenState.state === 'closed' ? 1 : 0;
  }
}
