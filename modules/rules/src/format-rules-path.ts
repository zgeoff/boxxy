export function formatRulesPath(segments: readonly PropertyKey[]): string {
  return segments.map((segment, index) => formatSegment(segment, index === 0)).join('');
}

const plainKeyPattern = /^[A-Za-z_][\w-]*$/u;

function formatSegment(segment: PropertyKey, isFirst: boolean): string {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  const key = String(segment);

  if (!plainKeyPattern.test(key)) {
    return `[${JSON.stringify(key)}]`;
  }

  return isFirst ? key : `.${key}`;
}
