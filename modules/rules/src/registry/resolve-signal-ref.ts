import type { JsonValue } from '@boxxy/content-hash';
import type { Registry, SignalRef } from '@boxxy/model';
import { signalKey } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildRejection } from '../loading/build-rejection.ts';
import type { Checked, ResolvedSignal } from '../types.ts';
import { resolvePlugin } from './resolve-plugin.ts';

export function resolveSignalRef(
  ref: SignalRef,
  path: readonly PropertyKey[],
  registry: Registry,
): Checked<ResolvedSignal> {
  const parts = toPluginRefParts(ref);
  const registered = registry.signal.get(parts.name);

  if (registered === undefined) {
    return {
      value: null,
      rejections: [buildRejection(path, { kind: 'unknown-signal', signal: parts.name })],
    };
  }

  const key = signalKey(parts.name, parts.params);
  const checked = resolvePlugin(registered, parts.params, key, path);

  return {
    value: checked.value === null ? null : { key, resolved: checked.value },
    rejections: checked.rejections,
  };
}

function toPluginRefParts(ref: SignalRef): { readonly name: string; readonly params: JsonValue } {
  if (typeof ref === 'string') {
    return { name: ref, params: {} };
  }

  const [entry] = Object.entries(ref);

  invariant(entry, 'the rules file schema gives a plug-in reference with parameters one key');

  return { name: entry[0], params: entry[1] };
}
