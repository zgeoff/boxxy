export const phaseSteps = ['triage', 'design', 'build', 'review'] as const;
export const stageSteps = [...phaseSteps, 'merge', 'release', 'deploy'] as const;

// `reported` and `none` are the values of the telemetry table's `cost_basis`. `turn` is the
// cost query's own: the line is a sum of turn cost rows.
export const costBases = ['reported', 'turn', 'none'] as const;
