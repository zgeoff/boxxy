import type { GateRound } from '@boxxy/model';
import { match } from 'ts-pattern';

// The file the command writes, which the session sends unchanged as its close-out.
export const reviewFileName = 'noslop-review.json';

// The script runs under Bun, which the agent host has for noslop, so the command needs no JSON
// tool of its own. `--report json` replaces the config's reporters, so the agent host posts
// nothing; `--adapter claude` uses the model sign-in the host's broker gives.
const script = `
const args = __ARGS__;
const run = (argv) => {
  const child = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'inherit' });
  return { exitCode: child.exitCode, text: child.stdout.toString() };
};
const parse = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};
const target = ['--pr', String(args.pr), '--repo', args.repo];
const options = [...target, '--adapter', 'claude', '--report', 'json', '--json'];
let review = parse(run(['noslop', 'review', args.mode, ...options]).text);
if (args.mode === '--fixes-only' && (review?.fixChecks ?? []).length === 0) {
  review = parse(run(['noslop', 'review', ...options]).text);
}
const listed = run(['noslop', 'findings', ...target, '--json']);
const head = run(['git', 'rev-parse', 'HEAD']).text.trim();
await Bun.write(args.file, JSON.stringify({ head, review, findings: { exitCode: listed.exitCode, list: parse(listed.text) } }));
`;

// A first review reads the whole pull request. A later one checks the fixes, and falls back to a
// plain review when no `fixed` answer got a verdict, because that run read nothing at its head.
export function buildReviewCommand(round: GateRound): string {
  const mode = match(round.cause)
    .with('first', () => '--full')
    .with('rework', 'recheck', () => '--fixes-only')
    .exhaustive();

  const args = JSON.stringify({
    pr: round.pullRequest.number,
    repo: round.pullRequest.repo,
    mode,
    file: reviewFileName,
  });

  const body = script
    .replace('__ARGS__', () => args)
    .trim()
    .replaceAll("'", String.raw`'\''`);

  return `bun -e '${body}'`;
}
