// The names a launch prompt template may use. The loader rejects a template that names any other.
export const promptPlaceholders = [
  'ticket',
  'title',
  'outcome',
  'body',
  'acceptance',
  'design',
  'findings',
  'notes',
  'repo',
  'attempt_id',
  'input',
] as const;
