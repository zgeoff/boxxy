import { expect, test } from 'bun:test';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { createFakeAtc } from './create-fake-atc.ts';

function setupTest() {
  return {
    atc: createFakeAtc({
      clock: createFakeClock(),
      targets: { box: 'suspending', laptop: 'local' },
    }),
  };
}

test('#atc_session_spawn answers the first session again for a second spawn with the same key', () => {
  const ctx = setupTest();
  const spawn = { target: 'box', cwd: '/tmp/boxxy-test/repo', name: 'a', idempotencyKey: 'key-1' };

  ctx.atc.answer('atc_session_spawn', spawn);

  expect(ctx.atc.answer('atc_session_spawn', spawn)).toMatchObject({
    kind: 'result',
    result: { id: 's1-fake' },
  });
});

test('#atc_session_spawn refuses a target it does not have', () => {
  const ctx = setupTest();

  const answer = ctx.atc.answer('atc_session_spawn', {
    target: 'elsewhere',
    cwd: '/tmp/boxxy-test/repo',
    name: 'a',
  });

  expect(answer).toStrictEqual({ kind: 'refusal', code: 'target_forbidden' });
});

test.each([
  ['box', 'suspended', 'sleep'],
  ['laptop', 'exited', 'stop'],
] as const)(
  '#atc_session_stop on the target %s leaves the harness %s',
  (target, harness, desired) => {
    const ctx = setupTest();

    ctx.atc.answer('atc_session_spawn', { target, cwd: '/tmp/boxxy-test/repo', name: 'a' });
    ctx.atc.answer('atc_session_stop', { session: 's1-fake' });

    expect(ctx.atc.answer('atc_session_get', { session: 's1-fake' })).toMatchObject({
      result: { session: { state: 'exited', lifecycle: { harness, desired } } },
    });
  },
);

test('#atc_session_forget takes a confirm token on a target that destroys its hosts', () => {
  const ctx = setupTest();

  ctx.atc.answer('atc_session_spawn', { target: 'box', cwd: '/tmp/boxxy-test/repo', name: 'a' });
  ctx.atc.answer('atc_session_stop', { session: 's1-fake' });
  ctx.atc.answer('atc_session_forget', { session: 's1-fake' });

  const forgot = ctx.atc.answer('atc_session_forget', {
    session: 's1-fake',
    confirmToken: 'confirm-s1-fake',
  });

  expect(forgot).toMatchObject({ result: { forgotten: true, destroyed: true } });
});

test('#atc_session_forget refuses a session that runs', () => {
  const ctx = setupTest();

  ctx.atc.answer('atc_session_spawn', { target: 'laptop', cwd: '/tmp/boxxy-test/repo', name: 'a' });

  expect(ctx.atc.answer('atc_session_forget', { session: 's1-fake' })).toStrictEqual({
    kind: 'refusal',
    code: 'session_live',
  });
});

test('#atc_message_send takes one message for two sends with the same key', () => {
  const ctx = setupTest();
  const message = { session: 's1-fake', text: 'Fix it.', idempotencyKey: 'key-1' };

  ctx.atc.answer('atc_session_spawn', { target: 'box', cwd: '/tmp/boxxy-test/repo', name: 'a' });
  ctx.atc.answer('atc_message_send', message);
  ctx.atc.answer('atc_message_send', message);

  expect(ctx.atc.listMessages('s1-fake')).toStrictEqual(['Fix it.']);
});

test('#failNext answers the failure once and then the call as it is', () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_sessions_list', { kind: 'refusal', code: 'daemon_unavailable' });
  ctx.atc.answer('atc_sessions_list', {});

  expect(ctx.atc.answer('atc_sessions_list', {})).toStrictEqual({
    kind: 'result',
    result: { sessions: [] },
  });
});

test('#takeGatewayFailure answers the gateway failure that the next failure sets', () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_sessions_list', { kind: 'rpc-error', code: -32_603 });

  expect(ctx.atc.takeGatewayFailure('atc_sessions_list', {})).toStrictEqual({
    kind: 'rpc-error',
    code: -32_603,
  });
});

test('#takeGatewayFailure answers null once the gateway failure is taken', () => {
  const ctx = setupTest();

  ctx.atc.failNext('atc_sessions_list', { kind: 'no-answer' });
  ctx.atc.takeGatewayFailure('atc_sessions_list', {});

  expect(ctx.atc.takeGatewayFailure('atc_sessions_list', {})).toBeNull();
});
