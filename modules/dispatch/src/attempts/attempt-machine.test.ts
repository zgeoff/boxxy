import { expect, test } from 'bun:test';
import { isUnhandled, transition } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import { attemptMachine } from './attempt-machine.ts';

test.each(['agent', 'attended'] as const)(
  'it reaches each of the 8 states on a generated path in %s mode',
  (mode) => {
    const paths = getShortestPaths(attemptMachine, {
      input: { mode },
      events: {
        started: [{ via: 'start' }, { via: 'reconcile' }],
        woken: [{ overCap: false }, { overCap: true }],
        settled: [
          { state: 'succeeded', sessionStopped: true },
          { state: 'failed', sessionStopped: false },
        ],
      },

      // each wake raises the hold generation, so a key with it never ends the traversal
      serializeState: (snapshot) =>
        JSON.stringify({ value: snapshot.value, context: { ...snapshot.context, holdGen: 0 } }),
    });

    expect(new Set(paths.map((path) => path.state.value))).toStrictEqual(
      new Set([
        'starting',
        'reconciling',
        'running',
        'sleeping',
        'waking',
        'closing',
        'succeeded',
        'failed',
      ]),
    );
  },
);

test('it marks the session of a stray failed attempt stopped', () => {
  const failed = attemptMachine.resolveState({
    value: 'failed',
    context: {
      mark: false,
      wakeRequested: false,
      mode: 'agent',
      holdGen: 1,
      closing: 'closed-out',
      hasSession: true,
      strayed: true,
      sessionStopped: false,
    },
  });

  const [after, effects] = transition(attemptMachine, failed, { type: 'stray-stopped' });

  expect({ value: after.value, context: after.context, effects }).toStrictEqual({
    value: 'failed',
    context: { ...failed.context, sessionStopped: true },
    effects: [],
  });
});

test('it leaves stray-stopped unhandled on a settled attempt that never strayed', () => {
  const succeeded = attemptMachine.resolveState({
    value: 'succeeded',
    context: {
      mark: false,
      wakeRequested: false,
      mode: 'agent',
      holdGen: 1,
      closing: 'closed-out',
      hasSession: true,
      strayed: false,
      sessionStopped: false,
    },
  });

  const result = transition(attemptMachine, succeeded, { type: 'stray-stopped' });

  expect(isUnhandled(succeeded, result)).toBeTrue();
});

test('it leaves a same-state move unhandled when its guard fails', () => {
  const marked = attemptMachine.resolveState({
    value: 'running',
    context: {
      mark: true,
      wakeRequested: false,
      mode: 'agent',
      holdGen: 1,
      closing: null,
      hasSession: true,
      strayed: false,
      sessionStopped: false,
    },
  });

  const result = transition(attemptMachine, marked, { type: 'suspend-asked' });

  expect(isUnhandled(marked, result)).toBeTrue();
});

test('it handles a same-state move that changes only the context', () => {
  const running = attemptMachine.resolveState({
    value: 'running',
    context: {
      mark: false,
      wakeRequested: false,
      mode: 'agent',
      holdGen: 1,
      closing: null,
      hasSession: true,
      strayed: false,
      sessionStopped: false,
    },
  });

  const result = transition(attemptMachine, running, { type: 'suspend-asked' });

  expect({ handled: !isUnhandled(running, result), mark: result[0].context.mark }).toStrictEqual({
    handled: true,
    mark: true,
  });
});
