// The faults of a package whose `exports` names a file that its tarball does not hold. npm packs a
// tarball under a top folder, `package/`; a pattern target such as `./src/test-utils/*.ts` is met
// when at least one packed file fits it.
export function collectUnshippedExports(
  manifestText: string,
  entries: readonly string[],
): string[] {
  const manifest: unknown = JSON.parse(manifestText);
  const exportsField = isRecord(manifest) ? manifest['exports'] : undefined;
  const shipped = entries.map((entry) => entry.replace(/^package\//u, './'));

  return listExportTargets(exportsField).flatMap((exportTarget) =>
    shipped.some((file) => isTargetMet(exportTarget.target, file))
      ? []
      : [
          `the export "${exportTarget.key}" names ${exportTarget.target}, which the tarball does not hold`,
        ],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ExportTarget {
  readonly key: string;
  readonly target: string;
}

// An `exports` that is one string, or an object of conditions, stands for the entry ".".
function listExportTargets(exportsField: unknown): ExportTarget[] {
  if (typeof exportsField === 'string') {
    return [{ key: '.', target: exportsField }];
  }

  if (!isRecord(exportsField)) {
    return [];
  }

  const keys = Object.keys(exportsField);

  if (keys.length > 0 && keys.every((key) => !key.startsWith('.'))) {
    return collectTargets('.', exportsField);
  }

  return keys.flatMap((key) => collectTargets(key, exportsField[key]));
}

function collectTargets(key: string, value: unknown): ExportTarget[] {
  if (typeof value === 'string') {
    return [{ key, target: value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => collectTargets(key, item));
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => collectTargets(key, item));
  }

  return [];
}

function isTargetMet(target: string, file: string): boolean {
  if (!target.includes('*')) {
    return target === file;
  }

  const escaped = target.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return new RegExp(`^${escaped.replaceAll('*', '.+')}$`, 'u').test(file);
}
