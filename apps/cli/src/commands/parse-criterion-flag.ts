const keptPattern = /^\[(?<id>[^\]\s]+)\]\s+(?<rest>\S.*)$/u;
const tagPattern = /^#(?<tag>[a-z][a-z0-9-]*)\s+/u;

interface CriterionFlag {
  id?: string;
  text: string;
  tags?: string[];
}

// One `--acceptance` value. `#prod #slow text` tags the line with prod and slow, and a value with
// no leading tag has none.
export function parseCriterionTags(entry: string): { text: string; tags?: string[] } {
  const tags: string[] = [];
  let text = entry;
  let match = tagPattern.exec(text);

  while (match?.groups?.['tag'] !== undefined) {
    tags.push(match.groups['tag']);

    text = text.slice(match[0].length);
    match = tagPattern.exec(text);
  }

  return tags.length === 0 ? { text: entry } : { text, tags };
}

// One `--acceptance` value of `item edit`. `[c-3] text` keeps the criterion c-3, with its
// evidence, and gives it the text. Any other value is a new criterion. Leading `#tag` words after
// the id set the tags of the line; a line with none keeps the tags it has.
export function parseCriterionFlag(entry: string): CriterionFlag {
  const groups = keptPattern.exec(entry)?.groups;

  if (groups?.['id'] === undefined || groups['rest'] === undefined) {
    return parseCriterionTags(entry);
  }

  return { id: groups['id'], ...parseCriterionTags(groups['rest']) };
}
