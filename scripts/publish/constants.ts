// The files that each release of the CLI attaches to its GitHub release. An agent image downloads
// them by these names, so a rename breaks every image build that pins them.
export const cliAssetNames = {
  binary: 'boxxy-linux-x64',
  plugin: 'boxxy-hook-plugin.tar.gz',
  checksums: 'SHA256SUMS',
} as const;

export const cliPackage = {
  path: 'apps/cli',
  entry: 'src/main.ts',
  pluginFolder: 'hook-plugin',
  compileTarget: 'bun-linux-x64',
} as const;
