// The paths that no feature's globs map and no ignore glob matches: each one fails wringer's gate
// as an unmapped path.
export function collectUnmappedPaths(
  paths: readonly string[],
  featureGlobs: Readonly<Record<string, readonly string[]>>,
  ignoreGlobs: readonly string[],
): string[] {
  const globs = [...Object.values(featureGlobs).flat(), ...ignoreGlobs].map(
    (pattern) => new Bun.Glob(pattern),
  );

  return paths.filter((path) => !globs.some((glob) => glob.match(path)));
}
