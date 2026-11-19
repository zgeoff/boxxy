const prefix = 'wait-overdue:';

export interface WaitOverdue {
  readonly kind: string;
  readonly hours: number;
}

// The wait kind and hours of a reason that `buildWaitOverdueReason` made; null for any other reason.
export function parseWaitOverdueReason(reason: string): WaitOverdue | null {
  if (!reason.startsWith(prefix)) {
    return null;
  }

  const rest = reason.slice(prefix.length);
  const split = rest.lastIndexOf(':');
  const hours = Number(rest.slice(split + 1));

  return split > 0 && Number.isFinite(hours) ? { kind: rest.slice(0, split), hours } : null;
}
