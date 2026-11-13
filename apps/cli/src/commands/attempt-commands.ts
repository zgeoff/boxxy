import type { BoxxyClient } from '@boxxy/contract';
import { match } from 'ts-pattern';
import {
  buildAnswerResult,
  buildErrorResult,
  buildTextResult,
} from '../cli/build-answer-result.ts';
import { UsageError } from '../cli/usage-error.ts';
import { exitCodes } from '../constants.ts';
import type { CLIResult, Command } from '../types.ts';
import { describeCloseOutProblem } from './describe-close-out-problem.ts';

const evidenceKinds = ['test', 'ci-run', 'live-check'] as const;

// every state but `held`: a session never sees a held item
const listStates = ['idea', 'ready', 'blocked', 'running', 'waiting', 'done', 'archived'] as const;
const waitMessage = 'no attempt for this session yet; try again in 5 seconds';

// These commands run inside a session. None takes a session: the server finds the session from
// the proven caller, and the command asks `attempt.current` for the attempt to name.
export const attemptCommands: readonly Command[] = [
  {
    path: ['attempt', 'current'],
    procedure: 'attempt.current',
    summary: 'Shows the attempt of this session, its input and the schema of its close-out.',
    options: {},
    run: async (call) => {
      const current = await call.client.attempt.current({});

      return current.kind === 'attempt'
        ? buildAnswerResult(current)
        : buildErrorResult(waitMessage, exitCodes.retryLater);
    },
  },
  {
    path: ['attempt', 'evidence'],
    procedure: 'attempt.evidence',
    summary: 'Records one piece of evidence and prints its ID, to cite in the close-out.',
    options: {
      kind: { type: 'string' },
      ref: { type: 'string' },
      observed: { type: 'string' },
    },
    run: async (call) => {
      const kind = call.args.requireOneOf('kind', evidenceKinds);
      const ref = call.args.requireString('ref');

      const attempt = await readCurrentAttempt(call.client);

      if (attempt === null) {
        return buildErrorResult(waitMessage, exitCodes.retryLater);
      }

      const answer = await call.client.attempt.evidence({
        session: { attempt },
        kind,
        ref,
        observed: call.args.string('observed'),
      });

      return describeEvidenceAnswer(answer);
    },
  },
  {
    path: ['attempt', 'close-out'],
    procedure: 'attempt.closeOut',
    summary: 'Sends the close-out, read as JSON from stdin. The first valid close-out is final.',
    options: {},
    run: async (call) => {
      const text = await call.deps.readStdin();

      const closeOut = parseJSON(text);

      const attempt = await readCurrentAttempt(call.client);

      if (attempt === null) {
        return buildErrorResult(waitMessage, exitCodes.retryLater);
      }

      const answer = await call.client.attempt.closeOut({ session: { attempt }, closeOut });

      return describeCloseOutAnswer(answer);
    },
  },
  {
    path: ['attempt', 'list-items'],
    procedure: 'attempt.listItems',
    summary: 'Lists the items of the repo of this session, newest first, held items left out.',
    options: {
      state: { type: 'string' },
      phase: { type: 'string' },
      text: { type: 'string' },
      label: { type: 'string' },
      limit: { type: 'string' },
      after: { type: 'string' },
    },
    run: async (call) => {
      const answer = await call.client.attempt.listItems({
        state: call.args.oneOf('state', listStates),
        phase: call.args.string('phase'),
        text: call.args.string('text'),
        label: call.args.string('label'),
        limit: call.args.integer('limit'),
        after: call.args.string('after'),
      });

      return answer.kind === 'items'
        ? buildAnswerResult(answer)
        : buildErrorResult(waitMessage, exitCodes.retryLater);
    },
  },
  {
    path: ['attempt', 'show-item'],
    procedure: 'attempt.getItem',
    summary:
      'Shows one item of the repo of this session with its body, notes, relations and pull requests.',
    options: {},
    run: async (call) => {
      const answer = await call.client.attempt.getItem({ item: call.args.positional(0, 'item') });

      return answer.kind === 'item'
        ? buildAnswerResult(answer)
        : buildErrorResult(waitMessage, exitCodes.retryLater);
    },
  },
];

async function readCurrentAttempt(client: BoxxyClient): Promise<string | null> {
  const current = await client.attempt.current({});

  return current.kind === 'attempt' ? current.attempt.id : null;
}

type EvidenceAnswer = Awaited<ReturnType<BoxxyClient['attempt']['evidence']>>;

function describeEvidenceAnswer(answer: EvidenceAnswer): CLIResult {
  if (answer.kind === 'recorded') {
    return buildTextResult(answer.factId);
  }

  const message = answer.reason === 'no-attempt' ? waitMessage : 'this attempt is over';

  return buildErrorResult(message);
}

function parseJSON(text: string): unknown {
  try {
    const body: unknown = JSON.parse(text);

    return body;
  } catch {
    throw new UsageError('stdin is not JSON');
  }
}

type CloseOutAnswer = Awaited<ReturnType<BoxxyClient['attempt']['closeOut']>>;

function describeCloseOutAnswer(answer: CloseOutAnswer): CLIResult {
  return match(answer)
    .with({ kind: 'recorded' }, (recorded) => buildTextResult(recorded.factId))
    .with({ kind: 'rejected' }, (rejected) =>
      buildErrorResult(
        rejected.problems.map((problem) => describeCloseOutProblem(problem)).join('\n'),
      ),
    )
    .with({ kind: 'refused', reason: 'no-attempt' }, () => buildErrorResult(waitMessage))
    .with({ kind: 'refused', reason: 'already-closed-out' }, () =>
      buildErrorResult(
        'this attempt already has a close-out, and the first valid close-out is final',
      ),
    )
    .with({ kind: 'refused', reason: 'not-current' }, () =>
      buildErrorResult('this attempt is over'),
    )
    .exhaustive();
}
