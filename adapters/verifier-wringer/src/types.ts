import type { Forge } from '@boxxy/model';

export interface WringerVerifierOptions {
  readonly forge: Pick<Forge, 'readChecks' | 'readPullRequestBody'>;

  // the name of the check run that runs `bun verify gate`, such as `verify / gate`
  readonly gateCheck: string;
}
