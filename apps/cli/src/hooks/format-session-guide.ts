import { evidenceKinds } from '../constants.ts';
import type { CurrentAttempt } from './wait-for-attempt.ts';

type EvidenceKindFlag = (typeof evidenceKinds)[number];

const screenshotKind: EvidenceKindFlag = 'live-check';
const measurementKind: EvidenceKindFlag = 'live-check';
const assertedKind: EvidenceKindFlag = 'test';

// The text that the session-start hook adds to the agent's context. A recipe prompt can leave out
// the close-out, and a session that ends without one fails, so the hook names it every time.
export function formatSessionGuide(
  closeOut: Pick<CurrentAttempt['closeOut'], 'phase' | 'outcomes'>,
): string {
  return [
    `boxxy runs this session as one attempt at the ${closeOut.phase} phase.`,
    'Your whole task is in the launch prompt, which carries the ticket. Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body.',
    'Your input is the `input` field of the JSON that `boxxy attempt current` prints: what boxxy gathered for this attempt, such as the acceptance list, the design, a send-back and the pull request.',
    'To find other items of this repo that ask for the same work or overlap yours, run `boxxy attempt list-items --text <word>`, and read one with `boxxy attempt show-item <item>`.',
    `To cite a test or a check, record it with \`boxxy attempt evidence --kind <${evidenceKinds.join('|')}> --ref <what you checked> --observed <what you saw>\` and use the ID it prints. \`--observed\` is optional.`,
    '`--ref` takes a test file and name, a CI run URL, or the command of a live check. `boxxy attempt close-out` takes no `--ref`: its body cites the ID that `boxxy attempt evidence` printed.',
    `For a screenshot, use \`${screenshotKind}\`, with the page or command in \`--ref\` and what it shows in \`--observed\`. For a measurement, use \`${measurementKind}\`, with the command in \`--ref\` and the number and its unit in \`--observed\`, or \`${assertedKind}\` when a test asserts it. A diff is no evidence kind: cite the test or check that shows what it changes.`,
    `Before you end, send the close-out body as JSON on stdin to \`boxxy attempt close-out\`, with one of these outcomes: ${closeOut.outcomes.join(', ')}.`,
    'When it prints problems, fix each one and send it again. The first valid close-out is final.',
    'A session that ends without a valid close-out fails.',
  ].join('\n');
}
