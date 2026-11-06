import type { JsonValue } from '@boxxy/content-hash';
import { contentHash } from '@boxxy/content-hash';
import type { SignalKey, SignalName } from './types/planning.ts';

export function signalKey(name: SignalName, params: JsonValue): SignalKey {
  return `${name}#${contentHash(params)}`;
}
