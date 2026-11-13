export const rulesFileName = 'rules.yaml';

// the phase whose steps need the file's `merge` block
export const mergePhase = 'merge';

// the phase whose kept session a `session: builder` recipe wakes
export const buildPhase = 'build';

// the phase whose sessions alone may run on a review agent
export const reviewPhase = 'review';
