import type { Release } from '@boxxy/model';

// A URL runs to whitespace, the end of the body, or the start of the next URL. Only a trailing run
// of punctuation and closing brackets is cut from it, so `…/tag/v1.0.)-patch` stays one URL that
// names no release, while `[v1.0](…/tag/v1.0).` names v1.0.
const URL_PATTERN = /(?<![A-Za-z0-9])https?:\/\/\S*?(?=https?:\/\/|\s|$)/gu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"'(<[{|]+$/u;

// The releases whose URL the body holds as a whole URL.
export function collectNamedReleases(body: string, releases: readonly Release[]): Release[] {
  const urls = new Set(
    Array.from(body.matchAll(URL_PATTERN), (match) => match[0].replace(TRAILING_PUNCTUATION, '')),
  );

  return releases.filter((release) => urls.has(release.url));
}
