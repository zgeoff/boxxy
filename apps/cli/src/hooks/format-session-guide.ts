import type { CurrentAttempt } from './wait-for-attempt.ts';

// The text that the session-start hook adds to the agent's context. A recipe prompt can leave out
// the close-out, and a session that ends without one fails, so the hook names it every time.
export function formatSessionGuide(
  closeOut: Pick<CurrentAttempt['closeOut'], 'phase' | 'outcomes'>,
): string {
  return [
    `boxxy runs this session as one attempt at the ${closeOut.phase} phase.`,
    "Run `boxxy attempt current` first. It prints this attempt as JSON: the item, your input, the owner's notes on the item, and `closeOut`, which holds the JSON Schema of the close-out body.",
    'To cite a test or a check, record it with `boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it prints.',
    `Before you end, send the close-out body as JSON on stdin to \`boxxy attempt close-out\`, with one of these outcomes: ${closeOut.outcomes.join(', ')}.`,
    'When it prints problems, fix each one and send it again. The first valid close-out is final.',
    'A session that ends without a valid close-out fails.',
  ].join('\n');
}
