export type SourceMatch =
  | { readonly kind: 'match' }
  | { readonly kind: 'invalid'; readonly message: string };

export interface SourceMatchInput {
  readonly tag: string;

  // what `git rev-parse HEAD` printed in the checkout
  readonly headSHA: string;

  // GitHub's commit for the tag, as `gh api repos/<repo>/commits/<tag>` prints it
  readonly tagAnswerText: string;
}

// A dispatch by hand can name any ref, and the upload tag comes from the manifest version, so a
// checkout of a later commit that has not bumped the version would attach code from outside the
// release.
export function pickSourceMatch(input: SourceMatchInput): SourceMatch {
  const tagSHA = parseCommitSHA(input.tagAnswerText);

  if (tagSHA === null) {
    return { kind: 'invalid', message: `GitHub gave no commit for ${input.tag}` };
  }

  const headSHA = input.headSHA.trim();

  if (headSHA !== tagSHA) {
    return {
      kind: 'invalid',
      message: `the run checked out ${headSHA}, but ${input.tag} is ${tagSHA}; dispatch the run at the release tag`,
    };
  }

  return { kind: 'match' };
}

function parseCommitSHA(text: string): string | null {
  const parsed = parseJSON(text);

  if (typeof parsed !== 'object' || parsed === null || !('sha' in parsed)) {
    return null;
  }

  return typeof parsed.sha === 'string' ? parsed.sha : null;
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}
