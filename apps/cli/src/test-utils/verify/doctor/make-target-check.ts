import type { DriveContext } from '@wringer/core';

interface SkippedCheck {
  readonly skipped: string;
}

// Wraps a doctor check that only one target can run, such as a check of the harness's control
// routes on `local`. The doctor runs every check on every target, so on any other target the check
// passes and says that it did not run.
export function makeTargetCheck<Data, Context extends Pick<DriveContext, 'target'>>(
  target: string,
  run: (ctx: Context) => Promise<Data>,
): (input: unknown, ctx: Context) => Promise<Data | SkippedCheck> {
  return (_input, ctx) =>
    ctx.target === target
      ? run(ctx)
      : Promise.resolve({ skipped: `runs on ${target} only, not on ${ctx.target}` });
}
