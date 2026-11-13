import type { CheckState } from '@boxxy/model';

export interface CheckRunRow {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
}

export interface CommitStatusRow {
  readonly context: string;
  readonly state: string;
}

// The state of the newest run of each check name, by GitHub's run id, and of each commit status. A
// check run wins over a commit status of the same name. A run that ended with no pass and no
// failure, such as `cancelled` or `skipped`, reads `other`.
export function collectCheckStates(
  checkRuns: readonly CheckRunRow[],
  statuses: readonly CommitStatusRow[],
): ReadonlyMap<string, CheckState> {
  const states = new Map<string, CheckState>();

  for (const status of statuses) {
    states.set(status.context, pickStatusState(status.state));
  }

  const newest = new Map<string, CheckRunRow>();

  for (const run of checkRuns) {
    const seen = newest.get(run.name);

    if (seen === undefined || run.id > seen.id) {
      newest.set(run.name, run);
    }
  }

  for (const run of newest.values()) {
    states.set(run.name, pickRunState(run));
  }

  return states;
}

const failedStates = new Set(['failure', 'error']);

function pickStatusState(state: string): CheckState {
  if (state === 'success') {
    return 'success';
  }

  if (failedStates.has(state)) {
    return 'failure';
  }

  return state === 'pending' ? 'pending' : 'other';
}

const failedConclusions = new Set(['failure', 'timed_out', 'startup_failure']);

function pickRunState(run: CheckRunRow): CheckState {
  if (run.status !== 'completed') {
    return 'pending';
  }

  if (run.conclusion === 'success') {
    return 'success';
  }

  return run.conclusion !== null && failedConclusions.has(run.conclusion) ? 'failure' : 'other';
}
