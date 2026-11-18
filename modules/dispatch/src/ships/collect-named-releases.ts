import type { Release } from '@boxxy/model';

// A bare URL runs to whitespace, the end of the body, or the start of the next URL. Only a trailing
// run of punctuation and closing brackets is cut from it, so `…/tag/v1.0.)-patch` stays one URL that
// names no release. A Markdown link's target ends at its closing bracket, whatever follows it.
const URL_PATTERN = /(?<![A-Za-z0-9])https?:\/\/\S*?(?=https?:\/\/|\s|$)/gu;
const LINK_TARGET_PATTERN = /\]\((?<target>https?:\/\/[^\s()]+)\)/gu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"'(<[{|]+$/u;

// The releases whose URL the body holds as a whole URL.
export function collectNamedReleases(body: string, releases: readonly Release[]): Release[] {
  const urls = new Set([
    ...Array.from(body.matchAll(URL_PATTERN), (match) =>
      match[0].replace(TRAILING_PUNCTUATION, ''),
    ),
    ...Array.from(body.matchAll(LINK_TARGET_PATTERN), (match) => match.groups?.['target'] ?? ''),
  ]);

  return releases.filter((release) => urls.has(release.url));
}
