// npm refuses to publish a version below the latest dist-tag without an explicit tag, so an older
// release publishes under `backport` and leaves `latest` on the newer version.
export function pickDistTagArgs(latestVersion: string | null, version: string): readonly string[] {
  if (latestVersion === null || Bun.semver.order(version, latestVersion) >= 0) {
    return [];
  }

  return ['--tag', 'backport'];
}
