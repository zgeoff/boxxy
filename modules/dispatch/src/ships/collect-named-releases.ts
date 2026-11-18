import type { Release } from '@boxxy/model';

// The releases whose URL the body holds as a whole URL, so `…/tag/v1.0` never matches the body that
// names `…/tag/v1.0.1`. A full stop that ends a sentence still ends the URL.
export function collectNamedReleases(body: string, releases: readonly Release[]): Release[] {
  return releases.filter((release) => {
    const escaped = release.url.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

    const whole = new RegExp(
      String.raw`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9_%/~-]|\.[A-Za-z0-9])`,
      'u',
    );

    return whole.test(body);
  });
}
