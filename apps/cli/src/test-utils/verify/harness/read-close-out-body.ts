import { toJSONValue } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { z } from 'zod';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import type { CloseOutPreset } from './types.ts';

interface CloseOutInput {
  readonly closeOut: CloseOutPreset;

  // the pull request that a `built` or `blocked` close-out links; null when the session links none
  readonly pullRequest: number | null;
}

// The close-out body of a preset. A `built` or `blocked` body first links the pull request that
// the harness seeded, through the post-tool-use hook. A `built` body also records one test evidence
// for the item's criterion.
export function readCloseOutBody(ctx: VerifyContext, input: CloseOutInput): Promise<unknown> {
  if (input.closeOut === 'accepted') {
    return Promise.resolve({
      result: { kind: 'accepted' },
      set: { designMode: 'agent' },
      relations: [],
      friction: [],
    });
  }

  if (input.closeOut === 'needs-owner') {
    return Promise.resolve({
      result: { kind: 'needs-owner', question: 'Which source of the theme wins?' },
      relations: [],
      friction: [],
    });
  }

  if (input.closeOut === 'designed') {
    return Promise.resolve({
      result: { kind: 'designed', design: { summary: 'Read the media query.', location: null } },
      friction: [],
    });
  }

  if (input.closeOut === 'passed') {
    // the server's review gate in the harness is a stand-in, which reads the body as its reading
    return Promise.resolve(toJSONValue(buildMockGateReading({ status: 'passed' })));
  }

  if (input.closeOut === 'blocked') {
    return readBlockedBody(ctx, input.pullRequest);
  }

  return readBuiltBody(ctx, input.pullRequest);
}

async function readBlockedBody(ctx: VerifyContext, pullRequest: number | null): Promise<unknown> {
  await linkPullRequest(ctx, pullRequest);

  return {
    result: { kind: 'blocked', reason: 'Which source of the theme wins?' },
    criteria: [],
    openItems: [],
    friction: [],
  };
}

async function linkPullRequest(ctx: VerifyContext, pullRequest: number | null): Promise<void> {
  if (pullRequest === null) {
    return;
  }

  await runBoxxy(ctx, {
    argv: ['hook', 'post-tool-use'],
    stdin: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'gh pr create --fill' },
      tool_response: {
        stdout: `https://github.com/example/app/pull/${pullRequest}\n`,
        stderr: '',
        interrupted: false,
        isImage: false,
      },
    }),
    schema: z.unknown(),
  });
}

const criterionSchema = z.object({ id: z.string() });
const showSchema = z.object({ item: z.object({ acceptance: z.array(criterionSchema) }) });

async function readBuiltBody(ctx: VerifyContext, pullRequest: number | null): Promise<unknown> {
  await linkPullRequest(ctx, pullRequest);

  const shown = await runBoxxy(ctx, { argv: ['item', 'show', '@current'], schema: showSchema });

  const evidence = await runBoxxy(ctx, {
    argv: [
      'attempt',
      'evidence',
      '--kind',
      'test',
      '--ref',
      'theme.test.ts: follows the system',
      '--observed',
      '12 passed',
    ],
    schema: z.string(),
  });

  return {
    result: { kind: 'built' },
    criteria: shown.item.acceptance
      .slice(0, 1)
      .map((criterion) => ({ criterion: criterion.id, evidence })),
    openItems: [],
    friction: [],
  };
}
