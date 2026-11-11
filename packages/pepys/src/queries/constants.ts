// An attempt that the worker refused for capacity ran no session: it is no attempt of work, and
// neither query counts it.
export const noCapacityFailure = 'no-capacity';

// Outcome names of boxxy's phase kinds. A phase kind that renames one must change this list.
export const outcomeNames = {
  built: 'built',
  passed: 'passed',
  changesRequested: 'changes-requested',
} as const;
