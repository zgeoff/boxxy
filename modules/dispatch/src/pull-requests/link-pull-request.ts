import type { ItemId, PullRequestReading, PullRequestRef, StoreReader } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { pickCallAttempt } from '../attempts/pick-call-attempt.ts';
import { buildLinkChange } from './build-link-change.ts';
import { parsePullRequestUrl } from './parse-pull-request-url.ts';
import type { LinkPullRequestInput, LinkPullRequestResult } from './types.ts';

// It checks the call before the forge read and again in the write's lock, because a newer attempt
// can take the session while the forge answers.
export async function linkPullRequest(input: LinkPullRequestInput): Promise<LinkPullRequestResult> {
  const ref = parsePullRequestUrl(input.url);

  if (ref === null) {
    return { kind: 'refused', reason: 'not-a-pull-request-url' };
  }

  const latest = await input.store.read((reader) =>
    reader.findAttemptBySession(input.call.session),
  );

  const picked = pickCallAttempt(latest, input.call);

  if (picked.kind === 'refused') {
    return picked;
  }

  const attempt = picked.attempt;

  const item = await input.store.read((reader) =>
    reader.readItem(attempt.item, input.now, input.rules),
  );

  invariant(item !== null, 'the attempt of a call has its item');

  if (item.repo.toLowerCase() !== ref.repo.toLowerCase()) {
    return { kind: 'refused', reason: 'not-a-pull-request-url' };
  }

  const known = await input.store.read((reader) => readExisting(reader, ref, item.id));

  if (known !== 'none') {
    return toAnswer(known, ref);
  }

  const reading = await readOrNull(input, ref);

  if (reading === null) {
    return { kind: 'retry' };
  }

  return input.store.exclusive(async (tx) => {
    const latestInLock = await tx.findAttemptBySession(input.call.session);

    const current = pickCallAttempt(latestInLock, input.call);

    if (current.kind === 'refused') {
      return current;
    }

    const raced = await readExisting(tx, ref, item.id);

    if (raced !== 'none') {
      return toAnswer(raced, ref);
    }

    const applied = await tx.applyChange(
      buildLinkChange({
        attempt: current.attempt,
        ref,
        reading,
        source: 'hook',
        actor: `boxxy:hook:${current.attempt.id}`,
        now: input.now,
        newId: input.newId,
      }),
    );

    return applied.kind === 'applied'
      ? { kind: 'linked', repo: ref.repo, number: ref.number, repeat: false }
      : { kind: 'retry' };
  });
}

type Existing = 'none' | 'repeat' | 'elsewhere';

async function readExisting(
  reader: StoreReader,
  ref: PullRequestRef,
  item: ItemId,
): Promise<Existing> {
  const row = await reader.readPullRequestRow(ref);

  if (row === null) {
    return 'none';
  }

  const owner = await reader.readAttempt(row.attempt);

  return owner?.item === item ? 'repeat' : 'elsewhere';
}

function toAnswer(existing: Exclude<Existing, 'none'>, ref: PullRequestRef): LinkPullRequestResult {
  return existing === 'repeat'
    ? { kind: 'linked', repo: ref.repo, number: ref.number, repeat: true }
    : { kind: 'refused', reason: 'linked-elsewhere' };
}

async function readOrNull(
  input: LinkPullRequestInput,
  ref: PullRequestRef,
): Promise<PullRequestReading | null> {
  try {
    const reading = await input.forge.readPullRequest(ref);

    return reading === 'not-found' ? null : reading;
  } catch {
    return null;
  }
}
