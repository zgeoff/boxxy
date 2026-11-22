import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { WringerError } from '@wringer/core';
import { z } from 'zod';
import { runBoxxy, runBoxxyRefusal } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import type { CloseOutPreset } from './types.ts';

interface CloseOutInput {
  readonly closeOut: CloseOutPreset;

  // the pull request that a `built` or `blocked` close-out links; null when the session links none
  readonly pullRequest: number | null;

  // the head that a `passed` review covers; a head of no commit when left out
  readonly head?: string | null;
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
    const head = brandSchemas.commitSha.safeParse(input.head);

    return Promise.resolve(
      toJSONValue(
        buildMockGateReading({ status: 'passed', ...(head.success && { head: head.data }) }),
      ),
    );
  }

  if (input.closeOut === 'built-checked') {
    return readBuiltCheckedBody(ctx, input.pullRequest);
  }

  if (input.closeOut === 'blocked') {
    return readBlockedBody(ctx, input.pullRequest);
  }

  return readBuiltBody(ctx, input.pullRequest);
}

const criterionSchema = z.object({ id: z.string() });
const showSchema = z.object({ item: z.object({ acceptance: z.array(criterionSchema) }) });

// A `built` body that first shows the server read a check and a verdict at the pull request's head:
// a check that has no run is refused, then a check and a verdict that passed are recorded, and the
// close-out cites both for the first criterion. `seed-checks` puts the passing runs on the forge.
async function readBuiltCheckedBody(
  ctx: VerifyContext,
  pullRequest: number | null,
): Promise<unknown> {
  await linkPullRequest(ctx, pullRequest);

  const shown = await runBoxxy(ctx, { argv: ['item', 'show', '@current'], schema: showSchema });

  const refusal = await runBoxxyRefusal(ctx, {
    argv: ['attempt', 'evidence', '--kind', 'check', '--ref', 'nightly / lint'],
  });

  if (!refusal.includes('no check run named "nightly / lint"')) {
    throw new WringerError('check-failed', {
      message: `the refusal of a check with no run should say so, and said: ${refusal}`,
    });
  }

  const check = await runBoxxy(ctx, {
    argv: ['attempt', 'evidence', '--kind', 'check', '--ref', 'pr / checks'],
    schema: z.string(),
  });

  const verdict = await runBoxxy(ctx, {
    argv: ['attempt', 'evidence', '--kind', 'verdict', '--ref', 'file-item'],
    schema: z.string(),
  });

  const criterion = shown.item.acceptance[0]?.id;

  return {
    result: { kind: 'built' },
    criteria: [check, verdict].map((evidence) => ({ criterion, evidence })),
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

async function readBlockedBody(ctx: VerifyContext, pullRequest: number | null): Promise<unknown> {
  await linkPullRequest(ctx, pullRequest);

  return {
    result: { kind: 'blocked', reason: 'Which source of the theme wins?' },
    criteria: [],
    openItems: [],
    friction: [],
  };
}

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
