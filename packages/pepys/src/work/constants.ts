import { defineLinkType } from '@pepys/kit';

// `boxxy:attempt:<attempt ID>` to `telemetry:session:<atc or agent session ID>`
export const ranIn = defineLinkType({
  name: 'ran_in',
  from: ['boxxy:attempt'],
  to: ['telemetry:session'],
  hub: false,
});

// `boxxy:attempt:<attempt ID>` to `github:pull_request:<GitHub's own ID of the pull request>`
export const produced = defineLinkType({
  name: 'produced',
  from: ['boxxy:attempt'],
  to: ['github:pull_request'],
  hub: false,
});

// `boxxy:attempt:<attempt ID>` to `boxxy:item:<item ID>`
export const attemptOf = defineLinkType({
  name: 'attempt_of',
  from: ['boxxy:attempt'],
  to: ['boxxy:item'],
  hub: false,
});
