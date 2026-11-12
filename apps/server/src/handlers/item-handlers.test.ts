import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { ItemId } from '@boxxy/model';
import { z } from 'zod';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const server = await createTestServer();

  const itemSchema = z.union([brandSchemas.itemId, z.object({ body: z.string() })]);
  const rowSchema = z.record(z.string(), z.unknown());

  const answerSchema = z.object({
    json: z.object({
      code: z.string().optional(),
      item: itemSchema.optional(),
      items: z.array(rowSchema).optional(),
    }),
  });

  const callOwner = async (procedure: string, input: unknown) => {
    const response = await server.owner(buildRPCRequest({ procedure, input }));

    return { status: response.status, body: await response.json() };
  };

  return {
    ...server,
    callOwner,

    // the item that a call answered, the error code, the body of a shown item and the keys of the
    // first listed row
    readAnswer: async (procedure: string, input: unknown) => {
      const answer = await callOwner(procedure, input);

      const json = answerSchema.parse(answer.body).json;

      return {
        status: answer.status,
        code: json.code ?? null,
        item: typeof json.item === 'string' ? json.item : null,
        shownBody: typeof json.item === 'object' ? json.item.body : null,
        listedKeys: Object.keys(json.items?.[0] ?? {}),
      };
    },
    readItem: (item: ItemId) =>
      server.deps.store.read((tx) =>
        tx.readItem(item, server.dispatch.clock.now(), server.dispatch.rules()),
      ),
  };
}

test('#file refuses a repo that the server configuration does not name', async () => {
  const ctx = await setupTest();

  const answer = await ctx.callOwner('item.file', {
    repo: 'example/widget',
    title: 'Check a widget',
    outcome: 'The widget passes.',
  });

  expect(answer).toStrictEqual({
    status: 422,
    body: {
      json: {
        defined: true,
        code: 'REPO_NOT_CONFIGURED',
        message: 'the server configuration names no such repository',
        data: { repo: 'example/widget' },
      },
    },
  });
});

test('#close closes an item as a duplicate of the item that its live duplicate-of relation names', async () => {
  const ctx = await setupTest();
  const source = await ctx.dispatch.seedItem({});
  const target = await ctx.dispatch.seedItem({});

  await ctx.callOwner('relation.add', { source, target, type: 'duplicate-of' });

  const answer = await ctx.callOwner('item.close', {
    item: source,
    reason: 'duplicate',
    of: target,
  });

  expect(answer).toStrictEqual({ status: 200, body: { json: { item: source, ended: [] } } });

  const item = await ctx.readItem(source);

  expect(item?.closedAt).toBe(ctx.dispatch.clock.now());
});

test('#file stores the body and writes it in the filed fact', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Check a widget',
    outcome: 'The widget passes.',
    body: '## Context\n\nThe widget is old.',
  });

  const stored = await ctx.readItem(brandSchemas.itemId.parse(answer.item));
  const facts = await ctx.dispatch.listFacts('boxxy.item.filed');

  expect([stored?.body, facts.map((fact) => fact.payload)]).toStrictEqual([
    '## Context\n\nThe widget is old.',
    [expect.objectContaining({ body: '## Context\n\nThe widget is old.' })],
  ]);
});

test('#file stores an empty body when it gets none', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Check a widget',
    outcome: 'The widget passes.',
  });

  const stored = await ctx.readItem(brandSchemas.itemId.parse(answer.item));

  expect(stored?.body).toBe('');
});

test.each([
  [40_000, 200],
  [40_001, 400],
])('#file answers with the status of a body of %d characters', async (length, status) => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'T',
    outcome: 'O',
    body: 'a'.repeat(length),
  });

  expect(answer.status).toBe(status);
});

test('#file refuses a fact over the outbox limit with a too-large error and files nothing', async () => {
  const ctx = await setupTest();

  // JSON writes a control character as six bytes. The request stays under the server's body
  // limit, while the criteria that the row adds push the fact over the outbox limit.
  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'T',
    outcome: '\u0001'.repeat(3500),
    body: '\u0001'.repeat(40_000),
    acceptance: Array.from({ length: 30 }, () => 'a'),
  });

  const facts = await ctx.dispatch.listFacts('boxxy.item.filed');

  expect([answer.code, facts]).toStrictEqual(['FACT_TOO_LARGE', []]);
});

test('#edit replaces the body and writes it in the edited fact', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});
  const answer = await ctx.callOwner('item.edit', { item, body: '## Notes for the agent\n\nGo.' });
  const stored = await ctx.readItem(item);
  const facts = await ctx.dispatch.listFacts('boxxy.item.edited');

  expect([answer.status, stored?.body, facts.map((fact) => fact.payload)]).toStrictEqual([
    200,
    '## Notes for the agent\n\nGo.',
    [expect.objectContaining({ body: '## Notes for the agent\n\nGo.' })],
  ]);
});

test('#edit leaves the body as it is when the call has none', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, body: 'Kept.' });
  await ctx.callOwner('item.edit', { item, title: 'A new title' });

  const stored = await ctx.readItem(item);

  expect(stored?.body).toBe('Kept.');
});

test('#get returns the body, and #list leaves it out', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, body: 'The body.' });

  const shown = await ctx.readAnswer('item.get', { item });
  const listed = await ctx.readAnswer('item.list', {});

  expect([shown.shownBody, listed.listedKeys]).toStrictEqual([
    'The body.',
    expect.not.arrayContaining(['body']),
  ]);
});
