// Design sketch. It is not compiled.
//
// 03-flow.ts: the order of the harness's steps.
//
//   A. The harness process: start, serve, stop.
//   B. `run-session`: one attempt, from the claim to the settle.
//   C. `land-item`: an item from the filing to a merge that pepys reports.
//   D. The CI step that runs the gate.
//
// Nothing ticks on its own. The clock, the tick, the watch and the outbox move only when a step
// moves them, so each journey reads the same numbers on every run.

import { join } from 'node:path';
import { createSkillsRepo } from '@boxxy/cli/test-utils/create-skills-repo';
import { brandSchemas } from '@boxxy/model';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { makeBrokerSend } from '@boxxy/system-tests/test-utils/make-broker-send';
import { startPepysUnderTest } from '@boxxy/system-tests/test-utils/start-pepys-under-test';
import type { DriveContext } from '@wringer/core';
import type { CloseOutPreset, VerifyHarness } from './types.ts';

// ── A. The harness process ─────────────────────────────────────────────────────────────────────
//
// scripts/verify/harness/main.ts

const directory = process.env['BOXXY_VERIFY_DIR'];

if (directory === undefined) {
  throw new Error('set BOXXY_VERIFY_DIR; `bun verify up` sets it');
}

const harness = await createVerifyHarness(directory);

// Steps run one at a time, in arrival order. Each journey line is its own process, so a slow step
// cannot overlap the next.
const boxxy = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: makeBrokerSend(harness.server) });
const control = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: makeControlHandler(harness) });

console.log(
  JSON.stringify({
    event: 'listening',
    boxxy: `http://127.0.0.1:${String(boxxy.port)}`,
    control: `http://127.0.0.1:${String(control.port)}`,
  }),
);

process.once('SIGTERM', () => {
  void Promise.all([boxxy.stop(), control.stop()])
    .then(() => harness[Symbol.asyncDispose]())
    .then(() => process.exit(0));
});

async function createVerifyHarness(runDirectory: string): Promise<VerifyHarness> {
  const store = await createSQLiteClaimStore(join(runDirectory, 'boxxy.db'));
  const pepys = await startPepysUnderTest();
  const server = await createTestServer({ store, pepys: pepys.reader });

  const skills = await createSkillsRepo({
    folder: join(runDirectory, 'skills'),
    skills: { 'bake-off': { 'SKILL.md': 'Sketch three designs.\n' } },
  });

  server.dispatch.setRules({
    ...server.dispatch.rules(),
    skills: { source: skills.source, ref: brandSchemas.commitSha.parse(skills.ref) },
  });

  return {
    server,
    pepys,
    skillsURL: skills.baseURL,
    runDirectory,
    current: null,
    nextPullRequest: 1,
    [Symbol.asyncDispose]: async () => {
      await pepys[Symbol.asyncDispose]();
      await store.close();
    },
  };
}

// ── B. run-session ─────────────────────────────────────────────────────────────────────────────
//
// scripts/verify/harness/drive.ts. It runs in the verify CLI's process: the CLI steps run the real
// `boxxy` as a process, and the harness steps call a control route. Each step that fails throws
// `check-failed`, and the steps after it do not run.

export async function runSession(
  ctx: DriveContext,
  input: { readonly closeOut: CloseOutPreset; readonly minutes: number },
) {
  // 1. A tick claims the current item, and the fake worker starts its session.
  const started = await postControl(ctx, '/control/sessions/start', { queueMinutes: 0 });

  // 2. The session's hook fetches the pinned skills and binds the session.
  await runBoxxy(ctx, {
    argv: ['hook', 'session-start'],
    stdin: JSON.stringify(started.payload),
    schema: z.unknown(),
  });

  // 3. The agent works for its minutes, then closes out. A `built` close-out opens the pull
  //    request first and links it through the post-tool-use hook.
  await postControl(ctx, '/control/clock', { minutes: input.minutes });

  const body = await buildCloseOutBody(ctx, input.closeOut, started.attempt);

  await runBoxxy(ctx, { argv: ['attempt', 'close-out'], stdin: JSON.stringify(body), schema: z.unknown() });

  // 4. The turn ends; two ticks stop the session and settle the attempt.
  return postControl(ctx, '/control/sessions/end-turn', { attempt: started.attempt });
}

// ── C. land-item ───────────────────────────────────────────────────────────────────────────────
//
// The numbers here are the ones the report-cost journey checks: a build of 30 minutes and a merge
// 20 minutes after the review settles; one request of 1 USD in the build and one of 2 USD in the
// review, so 2 requests and 3 USD in all.

export async function landItem(ctx: DriveContext, input: { readonly title: string }) {
  const filed = await fileItem(ctx, input.title);

  await runSession(ctx, { closeOut: 'accepted', minutes: 4 });
  await runSession(ctx, { closeOut: 'designed', minutes: 10 });

  const opened = await postControl(ctx, '/control/pull-requests/open', null);
  const build = await runSession(ctx, { closeOut: 'built', minutes: 30 });
  const review = await runSession(ctx, { closeOut: 'passed', minutes: 8 });

  await postControl(ctx, '/control/pull-requests/merge', { number: opened.number, afterMinutes: 20 });

  // the build started at minute 14 and the review at minute 44, on the harness clock
  await postControl(ctx, '/control/telemetry', {
    requests: [
      { attempt: build.id, minute: 15, costUSD: 1 },
      { attempt: review.id, minute: 45, costUSD: 2 },
    ],
  });

  await postControl(ctx, '/control/outbox/drain', null);

  return { item: filed.item, pullRequest: opened.number };
}

// ── D. The CI step that runs the gate ──────────────────────────────────────────────────────────
//
// scripts/ci/run-verify-gate.ts, run as `bun run --silent ci:verify-gate` in the `verify`
// workflow. The pull request's body comes from the event, as GitHub wrote it when the run started.

export async function runVerifyGate(env: Readonly<Record<string, string | undefined>>): Promise<number> {
  const event = pullRequestEventSchema.parse(await Bun.file(requireEnv(env, 'GITHUB_EVENT_PATH')).json());
  const bodyFile = join(requireEnv(env, 'RUNNER_TEMP'), 'pr-body.md');

  await Bun.write(bodyFile, event.pull_request.body ?? '');

  // The checkout is GitHub's merge ref, so the merge base with the base branch is the base's tip,
  // and the gate fingerprints the change as it would land.
  const gate = Bun.spawn(
    ['bun', 'verify', 'gate', '--base', `origin/${event.pull_request.base.ref}`, '--body-file', bodyFile],
    { stdout: 'pipe', stderr: 'inherit' },
  );

  const output = await new Response(gate.stdout).text();

  process.stdout.write(output);

  // One annotation per failing feature and per unmapped path, which the Verifier adapter reads
  // from the check run through the forge.
  for (const line of formatGateAnnotations(parseGateEnvelope(output))) {
    console.log(line); // `::error title=verify gate::<feature>: <reason>`
  }

  return gate.exited;
}

// not sketched: fileItem, buildCloseOutBody, makeControlHandler, requireEnv, parseGateEnvelope,
// formatGateAnnotations,
// pullRequestEventSchema, runBoxxy, z

// one control route, its body and its answer typed by ControlRoutes in 02-types.ts
declare function postControl<Path extends string>(
  ctx: DriveContext,
  path: Path,
  body: ControlRequest<Path>,
): Promise<ControlResponse<Path>>;
