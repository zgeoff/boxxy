import { buildMockNoslopReport } from '@boxxy/closeout/test-utils/build-mock-noslop-report';
import { z } from 'zod';
import { runBoxxy } from '../run-boxxy.ts';
import type { VerifyContext } from '../verify-context.ts';
import type { CloseOutPreset } from './types.ts';

interface CloseOutInput {
  readonly closeOut: CloseOutPreset;

  // the pull request that a `built` close-out links; null when the session opens none
  readonly pullRequest: number | null;
}

// The close-out body of a preset. A `built` body first links the pull request that the harness
// seeded, through the post-tool-use hook, and records one test evidence for the item's criterion.
export function readCloseOutBody(ctx: VerifyContext, input: CloseOutInput): Promise<unknown> {
  if (input.closeOut === 'accepted') {
    return Promise.resolve({
      result: { kind: 'accepted' },
      set: { designMode: 'agent' },
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
    return Promise.resolve({
      verdict: { kind: 'passed' },
      noslop: buildMockNoslopReport(),
      friction: [],
    });
  }

  return readBuiltBody(ctx, input.pullRequest);
}

const criterionSchema = z.object({ id: z.string() });
const showSchema = z.object({ item: z.object({ acceptance: z.array(criterionSchema) }) });

async function readBuiltBody(ctx: VerifyContext, pullRequest: number | null): Promise<unknown> {
  if (pullRequest !== null) {
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
