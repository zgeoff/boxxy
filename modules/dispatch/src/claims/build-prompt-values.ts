import { getLaunchSections } from '@boxxy/model';
import type { Design, Finding, ItemView, JsonValue, NoteRow } from '@boxxy/model';
import { formatUTCDate } from './format-utc-date.ts';

interface PromptValueParts {
  readonly item: ItemView;
  readonly notes: readonly NoteRow[];
  readonly input: JsonValue;
  readonly attempt: string;
}

// The value of each placeholder of a launch prompt. A section with no content is an empty string.
export function buildPromptValues(parts: PromptValueParts): Record<string, string> {
  const item = parts.item;
  const sections = getLaunchSections(parts.input);
  const acceptance = buildAcceptance(item);
  const design = buildDesign(sections.design);
  const findings = buildFindings(sections.findings);
  const notes = buildNotes(parts.notes);

  const ticket = [`# ${item.title}`, item.outcome, item.body, acceptance, design, findings, notes]
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
    findings,
    notes,
    ticket,
    input: JSON.stringify(parts.input, null, 2),
  };
}

function buildAcceptance(item: ItemView): string {
  return item.acceptance.length === 0
    ? ''
    : `## Acceptance\n\n${item.acceptance.map((criterion) => `- ${criterion.id}: ${criterion.text}`).join('\n')}`;
}

function buildDesign(design: Design | null): string {
  if (design === null) {
    return '';
  }

  return [
    '## Design',
    design.text,
    ...(design.location === null ? [] : [`Location: ${design.location}`]),
  ].join('\n\n');
}

function buildFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return '';
  }

  const entries = findings.map((finding) => {
    const place =
      finding.path === undefined
        ? []
        : [finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`];

    return [`### ${finding.title}`, ...place, finding.body].join('\n');
  });

  return `## Findings to fix\n\n${entries.join('\n\n')}`;
}

function buildNotes(notes: readonly NoteRow[]): string {
  if (notes.length === 0) {
    return '';
  }

  const lines = notes
    .toSorted((first, second) => first.seq - second.seq)
    .map((note) => `- ${formatUTCDate(note.at)}: ${note.text}`);

  return `## Notes from the owner\n\n${lines.join('\n')}`;
}
