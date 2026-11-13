// Design sketch. It is not compiled.
//
// 02-types.ts: the contract between boxxy's verify CLI and the harness that `bun verify up`
// launches.
//
//   A. The launch: the environment in, the ready line out.
//   B. The control routes: the steps that only the harness can take.
//   C. The real CLI as a process, and the word `@current`.
//   D. The close-out presets and the shapes the reads check.
//
// All of it lives in apps/cli/src/test-utils/verify/, a test helper folder, because the harness
// imports the system tests' parts as they are: `createTestServer`, `startPepysUnderTest` and
// `runOutboxSender` (@boxxy/server/test-utils), and `createSkillsRepo` (the CLI's test-utils). It adds one: the broker routing that `createTestCLI` holds moves to its
// own export, `makeBrokerSend`, so the test and the harness route the same way.

import type { AttemptId, AttemptRow, ItemId, PhaseName } from '@boxxy/model';
import type { DriveContext } from '@wringer/core';
import { z } from 'zod';

// The sketch imports no test helper; these stand for the helpers' results.
type TestServer = Awaited<ReturnType<typeof createTestServer>>;
type PepysUnderTest = Awaited<ReturnType<typeof startPepysUnderTest>>;

declare function createTestServer(options: object): Promise<object>; // @boxxy/server/test-utils/create-test-server
declare function startPepysUnderTest(): Promise<object>; // @boxxy/server/test-utils/start-pepys-under-test

// ── A. The launch ──────────────────────────────────────────────────────────────────────────────

// verify/harness/main.ts reads one variable. It needs no atc, GitHub or pepys URL and no
// token: every outside system is a fake inside the process.
export interface HarnessEnv {
  // wringer's run folder for this `up`
  readonly BOXXY_VERIFY_DIR: string;
}

// The one JSON line the harness prints on stdout once both listeners answer. A failure before it
// exits the process with code 1 and the cause on stderr, so `bun verify up` fails with the log.
export interface HarnessReadyLine {
  readonly event: 'listening';

  // the CLI's BOXXY_URL: boxxy's two listeners behind the broker routing (section C)
  readonly boxxy: string;

  // the control routes (section B); wringer's `web` endpoint
  readonly control: string;
}

// What the harness holds for one run. State lives here and in the run folder's boxxy.db; `down`
// stops the process, and the next `up` starts from nothing.
export interface VerifyHarness extends AsyncDisposable {
  // createTestServer on a SQLite store in the run folder, with the reader of pepys under test.
  // Its clock is the fake one: time moves only when a control route moves it.
  readonly server: TestServer;
  readonly pepys: PepysUnderTest;

  // the local skills repo that the rules pin; the session-start hook fetches from it
  readonly skillsURL: string;
  readonly runDirectory: string;

  // the item the last `file-item` or `land-item` filed; null before
  current: ItemId | null;

  // the next pull request number; each opened pull request takes one, so journeys share none
  nextPullRequest: number;
}

// ── B. The control routes ──────────────────────────────────────────────────────────────────────
//
// JSON in and out on the `control` origin. Each route parses its body with a zod schema and
// answers 400 on a body it refuses, and 409 on a step whose state is wrong, such as a claim with
// no current item. The registry turns 409 into `check-failed` with the harness's message.

export interface ControlRoutes {
  // the store answers, and pepys under test answers a query
  'GET /control/health': { request: null; response: { clock: string } };

  'POST /control/current': { request: { item: ItemId }; response: null };
  'GET /control/current': { request: null; response: { item: ItemId } };

  // Advance the clock by `queueMinutes`, run one tick, and find the current item's live attempt.
  // Set the fake caller proof to that session's caller, and answer the session-start payload,
  // with a workspace in the run folder. 409 when the tick claimed nothing for the item.
  'POST /control/sessions/start': {
    request: { queueMinutes: number };
    response: { attempt: AttemptId; phase: PhaseName; payload: SessionStartPayload };
  };

  // advance the clock by the work minutes, before the close-out
  'POST /control/clock': { request: { minutes: number }; response: { clock: string } };

  // Mark the session's turn ended on the fake worker, run two ticks, and answer the attempt. 409
  // when the attempt has not settled after the second tick.
  'POST /control/sessions/end-turn': {
    request: { attempt: AttemptId };
    response: AttemptSummary;
  };

  // seed the fake forge with the pull request as open, before the build's post-tool-use hook
  'POST /control/pull-requests/open': { request: null; response: { number: number } };

  // Advance the clock by `afterMinutes`, seed the pull request as merged, run one pass of the
  // watch, and send pepys the signed merge webhook. 409 unless the watch saw the merge and pepys
  // answered 200.
  'POST /control/pull-requests/merge': {
    request: { number: number; afterMinutes: number };
    response: { mergedAt: string };
  };

  // one model request from the session of each given attempt, at the given minute of the clock
  'POST /control/telemetry': {
    request: { requests: readonly { attempt: AttemptId; minute: number; costUSD: number }[] };
    response: null;
  };

  // run the outbox sender into pepys under test until it is idle; 409 when a fact parks
  'POST /control/outbox/drain': { request: null; response: { sent: number } };
}

export interface SessionStartPayload {
  readonly session_id: string;
  readonly cwd: string;
  readonly hook_event_name: 'SessionStart';
  readonly source: 'startup';
}

export interface AttemptSummary {
  readonly id: AttemptId;
  readonly phase: PhaseName;
  readonly state: AttemptRow['state'];
  readonly outcome: string | null;
}

// ── C. The real CLI as a process ───────────────────────────────────────────────────────────────
//
// verify/run-boxxy.ts. It runs `bun apps/cli/src/main.ts <argv>` through `ctx.exec`, with
// BOXXY_URL set to the `boxxy` endpoint and BOXXY_SKILLS_URL to the harness's skills repo. It
// replaces the word `@current` with the item from `GET /control/current` first, so a journey line
// names no ID that only the run knows. A non-zero exit throws `check-failed` with the CLI's stderr.

export interface BoxxyRun<T> {
  readonly argv: readonly string[];
  readonly stdin?: string;
  readonly schema: z.ZodType<T>;
}

export declare function runBoxxy<T>(ctx: DriveContext, run: BoxxyRun<T>): Promise<T>;

// `check-failed` naming both values when they differ
export declare function expectEqual(label: string, actual: unknown, expected: unknown): void;

// The broker routing, the one part the harness adds to what the system tests have. It stands in for
// the broker of a deployment: a session or hook procedure goes to the worker listener with the
// worker token, and any other to the owner listener. The CLI sends no token, as in a session.
// @boxxy/server/test-utils/make-broker-send, moved out of createTestCLI, which then calls it.
export declare function makeBrokerSend(server: TestServer): (request: Request) => Promise<Response>;

// ── D. The close-out presets and the read shapes ───────────────────────────────────────────────

// A close-out body by name, one per outcome that moves an item forward. `built` records one test
// evidence for the item's criterion and runs the post-tool-use hook on a `gh pr create` output for
// the pull request that `/control/pull-requests/open` seeded.
export const closeOutPresetSchema = z.enum(['accepted', 'designed', 'built', 'passed']);

export type CloseOutPreset = z.infer<typeof closeOutPresetSchema>;

// Only the fields a journey checks. `item show` lists the attempts beside the item.
export const itemShowSchema = z.object({
  item: z.object({ title: z.string() }),
  attempts: z.array(
    z.object({ phase: z.string(), state: z.string(), outcome: z.string().nullable() }),
  ),
});

export const costSchema = z.object({
  totals: z.object({ requests: z.number(), costUSD: z.number() }),
});

export const timesSchema = z.object({
  steps: z.array(z.object({ step: z.string(), minutes: z.number().nullable() })),
});
