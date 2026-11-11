// The one file of modules/dispatch that may write the attempts table, the attempt sessions table
// or a limit seat. Tests and the store fixtures in test-utils seed those tables, so they are left
// out of the search.
const writerPath = 'attempts/build-attempt-change.ts';

const writePattern =
  /\btable:\s*["'`](?:attempts|attempt_sessions)["'`]|\bop:\s*["'`](?:take|release)-seats["'`]/u;

// The paths, relative to modules/dispatch/src, of each other source file that names such a write.
export function collectAttemptWrites(files: ReadonlyMap<string, string>): string[] {
  return [...files]
    .filter(
      ([path, text]) =>
        path !== writerPath &&
        !path.startsWith('test-utils/') &&
        !path.endsWith('.test.ts') &&
        writePattern.test(text),
    )
    .map(([path]) => path)
    .toSorted();
}
