import type { LoadRejection, Resolved, SignalKey } from '@boxxy/model';

export interface Checked<T> {
  readonly value: T | null;
  readonly rejections: readonly LoadRejection[];
}

export interface ResolvedSignal {
  readonly key: SignalKey;
  readonly resolved: Resolved<'signal'>;
}
