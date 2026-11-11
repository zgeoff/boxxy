import type { ContentHash } from '@boxxy/content-hash';
import { contentHash } from '@boxxy/content-hash';
import type {
  AttemptRow,
  CloseOutAnswer,
  CloseOutContext,
  FactId,
  LoadedRules,
  StoreChange,
  StoreTx,
} from '@boxxy/model';
import { closeOutSchema, toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import { pickCallAttempt } from '../attempts/pick-call-attempt.ts';
import type { CloseOutInput } from './types.ts';

// Records an attempt's close-out, in one store lock. The session check runs first, so the
// answer to a call for an attempt that is not current does not depend on the body.
export function closeOutAttempt(input: CloseOutInput): Promise<CloseOutAnswer> {
  return input.store.exclusive(async (tx) => {
    const latest = await tx.findAttemptBySession(input.call.session);

    const found = pickCallAttempt(latest, input.call);

    if (found.kind === 'refused') {
      return found;
    }

    const attempt = found.attempt;

    // the body only: the phase is the attempt's
    const hash = buildBodyHash(input.body);

    if (hash === null) {
      return {
        kind: 'rejected',
        problems: [{ kind: 'schema', path: '', message: 'the close-out is not valid JSON text' }],
      };
    }

    if (attempt.closeOutHash === hash && attempt.closeOutFact !== null) {
      return { kind: 'recorded', attempt: attempt.id, factId: attempt.closeOutFact, repeat: true };
    }

    if (attempt.state === 'closing' && attempt.closing === 'closed-out') {
      return { kind: 'refused', reason: 'already-closed-out' };
    }

    if (
      attempt.state === 'closing' ||
      attempt.state === 'succeeded' ||
      attempt.state === 'failed'
    ) {
      return { kind: 'refused', reason: 'not-current' };
    }

    return writeCloseOut(tx, input, attempt, hash);
  });
}

// null for a body that has no canonical JSON form, such as a string with a lone surrogate
function buildBodyHash(body: unknown): ContentHash | null {
  try {
    return contentHash(toJSONValue(body));
  } catch {
    return null;
  }
}

async function writeCloseOut(
  tx: StoreTx,
  input: CloseOutInput,
  attempt: AttemptRow,
  hash: ContentHash,
): Promise<CloseOutAnswer> {
  const phase = input.rules.phases.get(attempt.phase);

  // the phase left the rules after the claim: the attempt can no longer close out
  if (phase === undefined) {
    return { kind: 'refused', reason: 'not-current' };
  }

  const ctx = await readCloseOutContext(tx, input, attempt);

  const parsed = phase.closeOut.parse(input.body, ctx);

  if (parsed.kind === 'invalid') {
    return { kind: 'rejected', problems: parsed.problems };
  }

  const closeOut = closeOutSchema.safeParse(parsed.closeOut);

  invariant(closeOut.success, `the phase kind ${attempt.phase} gives a close-out of a known shape`);

  const built = buildAttemptChange({
    attempt,
    event: { kind: 'closed-out', closeOut: closeOut.data, hash },
    actor: `boxxy:attempt:${attempt.id}`,
    now: input.now,
    newId: input.newId,
  });

  if (built.kind === 'not-allowed') {
    return { kind: 'refused', reason: 'not-current' };
  }

  const result = await tx.applyChange(built.change);

  return result.kind === 'applied'
    ? {
        kind: 'recorded',
        attempt: attempt.id,
        factId: getClosedOutFact(built.change),
        repeat: false,
      }
    : { kind: 'refused', reason: 'not-current' };
}

async function readCloseOutContext(
  tx: StoreTx,
  input: CloseOutInput,
  attempt: AttemptRow,
): Promise<CloseOutContext> {
  const item = await tx.readItem(attempt.item, input.now, input.rules);

  invariant(item !== null, `an attempt's item is stored: ${attempt.item}`);

  const items = await tx.listItems({}, input.now, input.rules);

  return {
    item,
    attempt: attempt.id,
    evidence: await tx.listEvidence(attempt.id),
    world: buildWorld(
      input.rules,
      items.map((each) => each.id),
    ),
  };
}

function buildWorld(rules: LoadedRules, items: readonly CloseOutContext['item']['id'][]) {
  return {
    items: new Set(items),
    kinds: new Set(rules.kinds.keys()),
    relationTypes: new Set(rules.relationTypes.keys()),
  };
}

function getClosedOutFact(change: StoreChange): FactId {
  const fact = change.facts.find((candidate) => candidate.type === 'boxxy.attempt.closed_out');

  invariant(fact !== undefined, 'the closed-out move records its fact');

  return fact.id;
}
