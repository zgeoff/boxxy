import { match } from 'ts-pattern';
import type { GateEnvelope } from './parse-gate-envelope.ts';

// One `::error::` workflow command per failing feature and per unmapped path, so the check run
// names each cause next to the failed step. A failure that names neither, such as a base git
// cannot find, gets one annotation with the gate's message.
export function formatGateAnnotations(envelope: GateEnvelope): string[] {
  return match(envelope)
    .with({ kind: 'passed' }, () => [])
    .with({ kind: 'unreadable' }, () => [
      formatAnnotation('the gate printed no envelope; read the step log'),
    ])
    .with({ kind: 'failed' }, (failed) => {
      const lines = [
        ...failed.failing.map((feature) => formatAnnotation(`${feature.name}: ${feature.reason}`)),
        ...failed.unmapped.map((path) =>
          formatAnnotation(`${path}: no feature maps this path, and no ignore glob matches it`),
        ),
      ];

      return lines.length > 0 ? lines : [formatAnnotation(failed.message)];
    })
    .exhaustive();
}

// GitHub ends a workflow command at a line break, so the message escapes `%`, CR and LF as the
// workflow command syntax defines.
function formatAnnotation(message: string): string {
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

  return `::error title=verify gate::${escaped}`;
}
