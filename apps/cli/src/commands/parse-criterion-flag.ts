const keptPattern = /^\[(?<id>[^\]\s]+)\]\s+(?<text>\S.*)$/u;

// One `--acceptance` value of `item edit`. `[c-3] text` keeps the criterion c-3, with its
// evidence, and gives it the text. Any other value is a new criterion.
export function parseCriterionFlag(entry: string): { id?: string; text: string } {
  const groups = keptPattern.exec(entry)?.groups;

  if (groups?.['id'] === undefined || groups['text'] === undefined) {
    return { text: entry };
  }

  return { id: groups['id'], text: groups['text'] };
}
