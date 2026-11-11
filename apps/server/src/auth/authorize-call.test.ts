import { expect, test } from 'bun:test';
import { buildMockClaimChange } from '@boxxy/dispatch/test-utils/build-mock-claim-change';
import { buildMockFileItemChange } from '@boxxy/dispatch/test-utils/build-mock-file-item-change';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { buildMCPRequest } from '../test-utils/build-mcp-request.ts';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { buildSessionInput } from '../test-utils/build-session-input.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';
import { listSessionProcedures, listSessionTools } from '../test-utils/list-owner-procedures.ts';
import { readMCPAnswer } from '../test-utils/read-mcp-answer.ts';

async function setupTest() {
  const server = await createTestServer();

  return {
    ...server,

    // the rows a session or hook call could change: the attempts, the bound agent sessions and
    // the outbox
    readCallState: () =>
      server.deps.store.read(async (tx) => ({
        live: await tx.listLiveAttempts(),
        bound: await tx.findAttemptByAgentSession(brandSchemas.agentSessionId.parse('agent-1')),
        facts: await tx.readUnsentFacts(10_000),
      })),
  };
}

test.each(
  listSessionProcedures().flatMap(([procedure]) => [
    [procedure, 'build'],
    [procedure, 'review'],
  ]),
)(
  'it refuses %s for a %s attempt with the worker token and no proven caller',
  async (procedure, phase) => {
    const ctx = await setupTest();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse(phase));
    const before = await ctx.readCallState();

    const response = await ctx.worker(
      buildRPCRequest({
        procedure,
        input: buildSessionInput(procedure, attempt.id),
        token: ctx.workerToken,
      }),
    );

    const body = await response.json();
    const after = await ctx.readCallState();

    expect({ status: response.status, body, after }).toStrictEqual({
      status: 401,
      body: { json: { defined: false, code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      after: before,
    });
  },
);

test.each(listSessionProcedures())(
  'it refuses %s on the owner path, which carries no token',
  async (procedure) => {
    const ctx = await setupTest();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

    ctx.callerProof.setCaller(attempt.caller);

    const response = await ctx.owner(
      buildRPCRequest({ procedure, input: buildSessionInput(procedure, attempt.id) }),
    );

    const body = await response.json();

    expect({ status: response.status, body }).toStrictEqual({
      status: 401,
      body: { json: { defined: false, code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    });
  },
);

test.each(listSessionTools())(
  'it refuses the session tool %s with no proven caller',
  async (name) => {
    const ctx = await setupTest();

    const response = await ctx.worker(
      buildMCPRequest({
        path: '/mcp/session',
        method: 'tools/call',
        params: { name, arguments: {} },
        token: ctx.workerToken,
      }),
    );

    const answer = await readMCPAnswer(response);

    expect(answer.result).toStrictEqual({
      content: [
        { type: 'text', text: '{"defined":false,"code":"UNAUTHORIZED","message":"Unauthorized"}' },
      ],
      isError: true,
    });
  },
);

test.each(listSessionProcedures())(
  'it changes nothing on %s for a caller whose machine runs no session of boxxy',
  async (procedure) => {
    const ctx = await setupTest();
    const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));
    const before = await ctx.readCallState();

    ctx.callerProof.setCaller({ issuer: 'fake-worker', subject: 'machine-unknown' });

    const response = await ctx.worker(
      buildRPCRequest({
        procedure,
        input: buildSessionInput(procedure, attempt.id),
        token: ctx.workerToken,
      }),
    );

    const body: unknown = await response.json();
    const after = await ctx.readCallState();

    expect({ answer: JSON.stringify(body).includes('no-attempt'), after }).toStrictEqual({
      answer: true,
      after: before,
    });
  },
);

test.each(
  listSessionProcedures().flatMap(([procedure]) => [
    [procedure, 'build'],
    [procedure, 'review'],
  ]),
)(
  'it changes nothing on %s from session A for the %s attempt of session B',
  async (procedure, phase) => {
    const ctx = await setupTest();
    const first = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));
    const second = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse(phase));
    const before = await ctx.readCallState();

    ctx.callerProof.setCaller(first.caller);

    await ctx.worker(
      buildRPCRequest({
        procedure,
        input: buildSessionInput(procedure, second.id),
        token: ctx.workerToken,
      }),
    );

    const after = await ctx.readCallState();

    expect(after).toStrictEqual(before);
  },
);

test('it answers the attempt of the proven caller to attempt.current', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.callerProof.setCaller(attempt.caller);

  const response = await ctx.worker(
    buildRPCRequest({ procedure: 'attempt.current', input: {}, token: ctx.workerToken }),
  );

  const body = await response.json();

  expect(body).toStrictEqual({
    json: expect.objectContaining({
      kind: 'attempt',
      attempt: expect.objectContaining({ id: attempt.id }),
    }),
  });
});

test('it ignores the atc session of another attempt sent in an extra input field', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));
  const second = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  ctx.callerProof.setCaller(first.caller);

  await ctx.worker(
    buildRPCRequest({
      procedure: 'attempt.evidence',
      input: {
        session: { attempt: first.id, atcSession: second.atcSession },
        kind: 'test',
        ref: 'bun test',
      },
      token: ctx.workerToken,
    }),
  );

  const facts = await ctx.dispatch.listFacts('boxxy.evidence.recorded');

  expect(facts.map((fact) => fact.entity)).toStrictEqual([`boxxy:item:${first.item}`]);
});

test('it answers FORBIDDEN and logs a caller whom two sessions hold', async () => {
  const ctx = await setupTest();

  const caller = { issuer: 'host-a', subject: 'machine-1' };
  const first = buildMockV1AttemptRow({ state: 'starting', caller });
  const second = buildMockV1AttemptRow({ state: 'starting', caller });

  await ctx.deps.store.exclusive(async (tx) => {
    for (const attempt of [first, second]) {
      await tx.applyChange(buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })));
      await tx.applyChange(buildMockClaimChange(attempt));
    }
  });

  ctx.callerProof.setCaller(caller);

  const response = await ctx.worker(
    buildRPCRequest({
      procedure: 'attempt.evidence',
      input: { session: { attempt: first.id }, kind: 'test', ref: 'bun test' },
      token: ctx.workerToken,
    }),
  );

  const body = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 403,
    body: { json: { defined: false, code: 'FORBIDDEN', message: 'Forbidden' } },
  });

  expect(ctx.logged.map((entry) => entry.message)).toStrictEqual(['two sessions hold one caller']);
});

test('it refuses the first attempt of a kept session after the second attempt started', async () => {
  const ctx = await setupTest();
  const rework = await ctx.dispatch.seedRework({});

  ctx.callerProof.setCaller(rework.second.caller);

  const response = await ctx.worker(
    buildRPCRequest({
      procedure: 'attempt.evidence',
      input: { session: { attempt: rework.first.id }, kind: 'test', ref: 'bun test' },
      token: ctx.workerToken,
    }),
  );

  const body = await response.json();

  expect(body).toStrictEqual({ json: { kind: 'refused', reason: 'not-current' } });
});
