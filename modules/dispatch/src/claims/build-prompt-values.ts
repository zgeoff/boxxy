import { getLaunchSections } from '@boxxy/model';
import type { Design, ItemView, JsonValue, NoteRow, SentBack } from '@boxxy/model';
import type { PromptValues } from '@boxxy/prompt-template';
import { match } from 'ts-pattern';
import { formatUTCDate } from './format-utc-date.ts';

interface PromptValueParts {
  readonly item: ItemView;
  readonly notes: readonly NoteRow[];
  readonly input: JsonValue;
  readonly attempt: string;
}

// The value of each placeholder of a launch prompt. A section holds its content only, so the
// template writes the heading, and a section with no content is the empty string. The ticket is
// the one-placeholder form, so it writes each section's heading itself.
export function buildPromptValues(parts: PromptValueParts): PromptValues {
  const item = parts.item;
  const sections = getLaunchSections(parts.input);
  const acceptance = buildAcceptance(item);
  const design = buildDesign(sections.design);
  const conclusion = sections.conclusion ?? '';
  const findings = buildFindings(sections.sentBack);
  const stopped = sections.stopped ?? '';
  const notes = buildNotes(parts.notes);

  const ticket = [
    `# ${item.title}`,
    item.outcome,
    item.body,
    formatSection('Acceptance', acceptance),
    formatSection('Design', design),
    formatSection('Conclusion', conclusion),
    formatSection('Findings to answer', findings),
    formatSection('Where the last attempt stopped', stopped),
    formatSection('Notes from the owner', notes),
  ]
    .filter((part) => part !== '')
    .join('\n\n');

  return {
    title: item.title,
    outcome: item.outcome,
    body: item.body,
    repo: item.repo,
    attempt_id: parts.attempt,
    acceptance,
    design,
    conclusion,
    findings,
    stopped,
    notes,
    security: item.fields.security === true ? 'true' : '',
    ticket,
    input: JSON.stringify(parts.input, null, 2),
  };
}

function buildAcceptance(item: ItemView): string {
  return item.acceptance.map((criterion) => `- ${criterion.id}: ${criterion.text}`).join('\n');
}

function buildDesign(design: Design | null): string {
  if (design === null) {
    return '';
  }

  return [design.text, ...(design.location === null ? [] : [`Location: ${design.location}`])].join(
    '\n\n',
  );
}

function buildFindings(sentBack: SentBack | null): string {
  if (sentBack === null) {
    return '';
  }

  return match(sentBack)
    .with({ from: 'review' }, (review) =>
      [
        `The review at ${review.head} left findings open: high ${review.open.high}, medium ${review.open.medium}, low ${review.open.low}.`,
        review.answerHint,
      ].join('\n\n'),
    )
    .with({ from: 'verify' }, (verify) =>
      [
        `The verify${verify.head === null ? '' : ` at ${verify.head}`} failed these features:`,
        verify.features.map((feature) => `- ${feature}`).join('\n'),
      ].join('\n\n'),
    )
    .exhaustive();
}

function buildNotes(notes: readonly NoteRow[]): string {
  return notes
    .toSorted((first, second) => first.seq - second.seq)
    .map((note) => `- ${formatUTCDate(note.at)}: ${note.text}`)
    .join('\n');
}

function formatSection(heading: string, content: string): string {
  return content === '' ? '' : `## ${heading}\n\n${content}`;
}
