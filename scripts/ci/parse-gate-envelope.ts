import { findField } from './find-field.ts';

interface GateFailure {
  readonly name: string;
  readonly reason: string;
}

export type GateEnvelope =
  | { readonly kind: 'passed' }
  | {
      readonly kind: 'failed';
      readonly failing: readonly GateFailure[];
      readonly unmapped: readonly string[];
      readonly message: string;
    }
  | { readonly kind: 'unreadable' };

// The JSON envelope that `bun verify gate` prints on stdout. A check failure puts the failing
// features and the unmapped paths in `data`. Any other error, such as a base that git cannot find,
// gives only its message.
export function parseGateEnvelope(text: string): GateEnvelope {
  const envelope = parseJSON(text.trim());
  const ok = findField(envelope, 'ok');

  if (ok === true) {
    return { kind: 'passed' };
  }

  const message = findField(findField(envelope, 'error'), 'message');

  if (ok !== false || typeof message !== 'string') {
    return { kind: 'unreadable' };
  }

  const data = findField(envelope, 'data');

  return {
    kind: 'failed',
    failing: collectFailures(findField(data, 'failing')),
    unmapped: collectTexts(findField(data, 'unmapped')),
    message,
  };
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

function collectFailures(value: unknown): GateFailure[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item: unknown) => {
    const name = findField(item, 'name');
    const reason = findField(item, 'reason');

    return typeof name === 'string' && typeof reason === 'string' ? [{ name, reason }] : [];
  });
}

function collectTexts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item: unknown): item is string => typeof item === 'string');
}
