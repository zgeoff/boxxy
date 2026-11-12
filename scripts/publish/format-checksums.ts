export interface FileChecksum {
  readonly name: string;

  readonly sha256: string;
}

// The text form of `sha256sum`, which `sha256sum -c` reads back in the folder that holds the files.
export function formatChecksums(checksums: readonly FileChecksum[]): string {
  return checksums.map((checksum) => `${checksum.sha256}  ${checksum.name}\n`).join('');
}
