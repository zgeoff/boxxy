// A folder is trusted when it is one of the trusted folders or lies inside one.
export function isFolderTrusted(trustedFolders: readonly string[], folder: string): boolean {
  const path = trimTrailingSlashes(folder);

  return trustedFolders
    .map((trusted) => trimTrailingSlashes(trusted))
    .some((trusted) => trusted !== '' && (path === trusted || path.startsWith(`${trusted}/`)));
}

function trimTrailingSlashes(path: string): string {
  return path.replace(/\/+$/u, '');
}
