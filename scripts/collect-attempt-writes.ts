// The files of modules/dispatch that may write an attempt, a bound session or a seat: the attempt
// builder, and the builder of a skip, which has no machine. Tests and the store fixtures in
// test-utils seed those tables, so they are left out.
const writerPaths = new Set(['attempts/build-attempt-change.ts', 'attempts/build-skip-change.ts']);

const writePattern =
  /\btable:\s*["'`](?:attempts|attempt_sessions)["'`]|\bop:\s*["'`](?:take|release)-seats["'`]|\bop:\s*["'`]remove-attempt["'`]/u;

// The paths, relative to modules/dispatch/src, of each other source file that names such a write.
export function collectAttemptWrites(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(
      ([path, text]) =>
        !writerPaths.has(path) &&
        !path.startsWith('test-utils/') &&
        !path.endsWith('.test.ts') &&
        writePattern.test(text),
    )
    .map(([path]) => path)
    .toSorted();
}
