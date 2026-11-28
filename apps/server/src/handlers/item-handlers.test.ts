import { expect, test } from 'bun:test';
import { closeOutAttempt, settleAttempt } from '@boxxy/dispatch';
import { buildMockLeverChange } from '@boxxy/dispatch/test-utils/build-mock-lever-change';
import { seedSignoffWait } from '@boxxy/dispatch/test-utils/seed-signoff-wait';
import { attemptSummarySchema, brandSchemas } from '@boxxy/model';
import type { ItemId } from '@boxxy/model';
import invariant from 'tiny-invariant';
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

  // an item in the state a call under test needs
  const seed = {
    plain: () => server.dispatch.seedItem({}),
    held: async () => {
      const filed = await callOwner('item.file', {
        repo: 'example/app',
        title: 'Draft a dark theme',
        outcome: 'The app has a dark theme.',
        held: { reason: 'still a draft' },
      });

      return brandSchemas.itemId.parse(answerSchema.parse(filed.body).json.item);
    },
    atSignoff: async () => {
      const waiting = await seedSignoffWait(server.dispatch, server.forge);

      return waiting.item;
    },
  };

  return {
    ...server,
    callOwner,
    seed,

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

test('#file with held stores the item held, with the filed fact and the held lever fact', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Draft a dark theme',
    outcome: 'The app has a dark theme.',
    held: { reason: 'still a draft' },
  });

  const item = brandSchemas.itemId.parse(answer.item);

  const stored = await ctx.readItem(item);
  const filed = await ctx.dispatch.listFacts('boxxy.item.filed');
  const levers = await ctx.dispatch.listFacts('boxxy.lever.recorded');

  expect(stored?.derived).toStrictEqual({ state: 'held', reason: 'still a draft' });

  expect([filed.map((fact) => fact.entity), levers.map((fact) => fact.payload)]).toStrictEqual([
    [`boxxy:item:${item}`],
    [expect.objectContaining({ item, kind: 'item.held', reason: 'still a draft' })],
  ]);
});

test('#file with held refuses an item with no outcome, as it refuses any other', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Draft a dark theme',
    held: { reason: 'still a draft' },
  });

  const filed = await ctx.dispatch.listFacts('boxxy.item.filed');

  expect([answer.status, filed]).toStrictEqual([400, []]);
});

test('#release writes a release lever fact, and the item is ready again', async () => {
  const ctx = await setupTest();

  const filed = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Draft a dark theme',
    outcome: 'The app has a dark theme.',
    held: { reason: 'still a draft' },
  });

  const item = brandSchemas.itemId.parse(filed.item);

  const answer = await ctx.callOwner('item.release', { item });
  const stored = await ctx.readItem(item);
  const levers = await ctx.dispatch.listFacts('boxxy.lever.recorded');

  expect(answer.body).toStrictEqual({ json: { kind: 'released', item } });

  expect([stored?.derived, levers.map((fact) => fact.payload)]).toStrictEqual([
    { state: 'ready' },
    [
      expect.objectContaining({ kind: 'item.held' }),
      expect.objectContaining({ kind: 'item.release', item }),
    ],
  ]);
});

test('#release refuses an item that is not held and writes nothing', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});
  const answer = await ctx.callOwner('item.release', { item });
  const levers = await ctx.dispatch.listFacts('boxxy.lever.recorded');

  expect([answer.body, levers]).toStrictEqual([
    { json: { kind: 'refused', reason: 'not-held' } },
    [],
  ]);
});

test('#release answers not found for an item that does not exist', async () => {
  const ctx = await setupTest();
  const answer = await ctx.readAnswer('item.release', { item: 'i-404' });

  expect(answer.code).toBe('NOT_FOUND');
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

test('#file sets the security mark with the design mode', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Escape the widget name',
    outcome: 'The widget name is escaped.',
    designMode: 'attended',
    security: true,
  });

  const stored = await ctx.readItem(brandSchemas.itemId.parse(answer.item));

  expect(stored?.fields).toStrictEqual({ designMode: 'attended', security: true });
});

test('#edit sets the security mark and keeps the design mode', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, designMode: 'attended' });
  await ctx.callOwner('item.edit', { item, security: true });

  const stored = await ctx.readItem(item);
  const facts = await ctx.dispatch.listFacts('boxxy.item.edited');

  expect([stored?.fields, facts.at(-1)?.payload]).toStrictEqual([
    { designMode: 'attended', security: true },
    expect.objectContaining({ fields: { designMode: 'attended', security: true } }),
  ]);
});

test('#edit clears the security mark when the call gives false', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, security: true });
  await ctx.callOwner('item.edit', { item, security: false });

  const stored = await ctx.readItem(item);

  expect(stored?.fields).toStrictEqual({});
});

test('#edit leaves the security mark as it is when the call names other fields only', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, security: true });
  await ctx.callOwner('item.edit', { item, title: 'A new title' });

  const stored = await ctx.readItem(item);

  expect(stored?.fields).toStrictEqual({ security: true });
});

test('#get returns the body, and #list leaves it out', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  await ctx.callOwner('item.edit', { item, body: 'The body.' });

  const shown = await ctx.readAnswer('item.get', { item });
  const listed = await ctx.readAnswer('item.list', {});

  expect([shown.shownBody, listed.listedKeys.includes('body')]).toStrictEqual(['The body.', false]);
});

test('#file stores a listed tag on its acceptance line, and writes it in the filed fact', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Check the page',
    outcome: 'The page loads.',
    acceptance: ['The unit tests pass', { text: 'The page loads in production', tags: ['prod'] }],
  });

  const item = brandSchemas.itemId.parse(answer.item);

  const stored = await ctx.readItem(item);
  const facts = await ctx.dispatch.listFacts('boxxy.item.filed');

  const acceptance: unknown = stored?.acceptance;

  expect(acceptance).toStrictEqual([
    { id: 'a1', text: 'The unit tests pass', evidence: [] },
    { id: 'a2', text: 'The page loads in production', evidence: [], tags: ['prod'] },
  ]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    expect.objectContaining({ acceptance }),
  ]);
});

test('#file refuses a tag the rules file does not list, and files nothing', async () => {
  const ctx = await setupTest();

  const answer = await ctx.callOwner('item.file', {
    repo: 'example/app',
    title: 'Check the page',
    outcome: 'The page loads.',
    acceptance: [{ text: 'The page loads', tags: ['smoke'] }],
  });

  const filed = await ctx.dispatch.listFacts('boxxy.item.filed');

  expect([answer.status, filed]).toStrictEqual([400, []]);
});

test('#edit sets a tag, keeps it when a later edit names the line with no tags, and refuses an unlisted tag', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});
  const seeded = await ctx.readItem(item);

  const line = seeded?.acceptance[0];

  invariant(line !== undefined, 'the seeded item has an acceptance line');

  await ctx.callOwner('item.edit', {
    item,
    acceptance: [{ id: line.id, text: line.text, tags: ['prod'] }],
  });

  await ctx.callOwner('item.edit', { item, acceptance: [{ id: line.id, text: 'A new text' }] });

  const edited = await ctx.readItem(item);

  const kept = edited?.acceptance[0];

  const refused = await ctx.callOwner('item.edit', {
    item,
    acceptance: [{ id: line.id, text: line.text, tags: ['smoke'] }],
  });

  expect([kept?.text, kept?.tags, refused.status]).toStrictEqual(['A new text', ['prod'], 400]);
});

test('#get returns the tags of an acceptance line', async () => {
  const ctx = await setupTest();

  const answer = await ctx.callOwner('item.file', {
    repo: 'example/app',
    title: 'Check the page',
    outcome: 'The page loads.',
    acceptance: [{ text: 'The page loads', tags: ['prod'] }],
  });

  const answerSchema = z.object({ json: z.object({ item: z.string() }) });
  const filed = answerSchema.parse(answer.body).json.item;
  const item = brandSchemas.itemId.parse(filed);

  const shown = await ctx.callOwner('item.get', { item });

  expect(JSON.stringify(shown.body)).toContain('"tags":["prod"]');
});

test('#signoff approves the head that waits, and sends the item from the hold to the merge step', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);
  const held = await ctx.readItem(seeded.item);

  ctx.dispatch.clock.advance(1000);

  const answer = await ctx.callOwner('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'approve',
  });

  const view = await ctx.readItem(seeded.item);
  const facts = await ctx.dispatch.listFacts('boxxy.lever.recorded');

  const seen: unknown = { answer, position: view?.position };

  // the item keeps the round it held in
  const round = held?.position.kind === 'hold' ? held.position.round : null;

  expect(seen).toStrictEqual({
    answer: { status: 200, body: { json: { lever: expect.any(Number) } } },
    position: { kind: 'phase', phase: 'merge', round },
  });

  expect(facts.map((fact) => fact.payload)).toContainEqual(
    expect.objectContaining({ kind: 'signoff.approve', head: seeded.head, reason: null }),
  );
});

test('#signoff stores the findings of a send-back whole', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  const findings = 'The new rule contradicts the old one.\n'.repeat(200);

  ctx.dispatch.clock.advance(1000);

  await ctx.callOwner('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'send-back',
    findings,
  });

  const facts = await ctx.dispatch.listFacts('boxxy.lever.recorded');

  expect(facts.map((fact) => fact.payload)).toContainEqual(
    expect.objectContaining({ kind: 'signoff.send-back', head: seeded.head, reason: findings }),
  );
});

test('#signoff refuses another head with the head that waits', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  const answer = await ctx.callOwner('item.signoff', {
    item: seeded.item,
    head: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    verdict: 'approve',
  });

  expect(answer).toStrictEqual({
    status: 409,
    body: {
      json: {
        defined: true,
        code: 'STALE_HEAD',
        message: 'the pull request head is not the one that waits for a sign-off',
        data: { head: seeded.head },
      },
    },
  });
});

test('#signoff refuses a send-back with no findings', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  const answer = await ctx.readAnswer('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'send-back',
    findings: '  ',
  });

  expect([answer.status, answer.code]).toStrictEqual([422, 'FINDINGS_REQUIRED']);
});

test('#signoff refuses findings over 8000 characters as a bad input', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  const answer = await ctx.readAnswer('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'send-back',
    findings: 'x'.repeat(8001),
  });

  expect([answer.status, answer.code]).toStrictEqual([400, 'BAD_REQUEST']);
});

test('#signoff refuses an item that does not wait for a sign-off', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});

  const answer = await ctx.readAnswer('item.signoff', {
    item,
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    verdict: 'approve',
  });

  expect([answer.status, answer.code]).toStrictEqual([409, 'NOT_AWAITING_SIGNOFF']);
});

test('#signoff refuses an item that does not exist', async () => {
  const ctx = await setupTest();

  const answer = await ctx.readAnswer('item.signoff', {
    item: '01900000-0000-7000-8000-000000000000',
    head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
    verdict: 'approve',
  });

  expect([answer.status, answer.code]).toStrictEqual([404, 'NOT_FOUND']);
});

test('#signoff refuses an item that is held', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  await ctx.dispatch.store.exclusive((tx) =>
    tx.applyChange(
      buildMockLeverChange({
        seq: 90,
        kind: 'item.held',
        item: seeded.item,
        until: null,
        expiresAt: null,
        reason: 'a draft',
        phase: null,
        head: null,
        actor: 'boxxy:owner:local',
        at: ctx.dispatch.clock.now(),
      }),
    ),
  );

  const answer = await ctx.readAnswer('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'approve',
  });

  expect([answer.status, answer.code]).toStrictEqual([400, 'ITEM_HELD']);
});

test('#signoff refuses an item that was closed at the hold', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  await ctx.callOwner('item.close', { item: seeded.item, reason: 'wontfix' });

  const answer = await ctx.readAnswer('item.signoff', {
    item: seeded.item,
    head: seeded.head,
    verdict: 'approve',
  });

  expect([answer.status, answer.code]).toStrictEqual([409, 'NOT_AWAITING_SIGNOFF']);
});

test('it lists each item that waits for a sign-off, with its head, rules and paths', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);
  const answer = await ctx.callOwner('signoff.list', {});

  expect(answer).toStrictEqual({
    status: 200,
    body: {
      json: {
        items: [
          {
            item: seeded.item,
            title: expect.any(String),
            pullRequest: { repo: 'example/app', number: 7 },
            head: seeded.head,
            rules: ['skills'],
            paths: ['skills/testing/SKILL.md'],
            truncated: false,
            since: expect.any(Number),
          },
        ],
      },
    },
  });
});

test('it lists no item for a sign-off once the owner answered', async () => {
  const ctx = await setupTest();
  const seeded = await seedSignoffWait(ctx.dispatch, ctx.forge);

  ctx.dispatch.clock.advance(1000);

  await ctx.callOwner('item.signoff', { item: seeded.item, head: seeded.head, verdict: 'approve' });

  const answer = await ctx.callOwner('signoff.list', {});

  expect(answer).toStrictEqual({ status: 200, body: { json: { items: [] } } });
});

test('#file gives each item the short reference one above the one filed before it, whichever way it was filed', async () => {
  const ctx = await setupTest();

  const seeded = await ctx.dispatch.seedItem({
    phase: brandSchemas.phaseName.parse('design'),
  });

  const claim = await ctx.dispatch.claim();

  invariant(claim?.attempt.item === seeded, 'the claim picks the seeded design item');

  const attempt = await ctx.dispatch.readAttempt(claim.attempt.id);

  const closed = await closeOutAttempt({
    store: ctx.deps.store,
    call: ctx.dispatch.buildCallRef(attempt),
    body: {
      result: {
        kind: 'designed',
        design: { text: 'Follow the system theme.', location: null },
        openItems: [
          {
            kind: 'core.issue',
            title: 'Cache the theme',
            body: 'Found while designing.',
          },
        ],
      },
      friction: [],
    },
    rules: ctx.dispatch.rules(),
    now: ctx.dispatch.clock.now(),
    newId: ctx.dispatch.newId,
  });

  invariant(closed.kind === 'recorded', 'the close-out records');

  await settleAttempt({
    store: ctx.deps.store,
    attempt: attempt.id,
    forced: null,
    sessionStopped: true,
    rules: ctx.dispatch.rules(),
    actor: 'boxxy:runner:runner-1',
    now: ctx.dispatch.clock.now(),
    newId: ctx.dispatch.newId,
  });

  const filed = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Check a widget',
    outcome: 'The widget passes.',
  });

  const items = await ctx.deps.store.read((tx) =>
    tx.listItems({}, ctx.dispatch.clock.now(), ctx.dispatch.rules()),
  );

  expect(items.map((item) => [item.title, item.ref])).toStrictEqual([
    ['Add a dark theme', 'i-1'],
    ['Cache the theme', 'i-2'],
    ['Check a widget', 'i-3'],
  ]);

  expect(filed.item).toBe(items[2]?.id ?? null);
});

test('#get reads an item by its short reference as it reads it by its ID', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});
  const byID = await ctx.callOwner('item.get', { item });
  const byRef = await ctx.callOwner('item.get', { item: 'i-1' });

  expect(byRef).toStrictEqual(byID);
});

test.each([
  ['item.get', { item: 'i-404' }],
  ['item.edit', { item: 'i-404', title: 'A title' }],
  ['item.close', { item: 'i-404', reason: 'no longer needed' }],
  ['item.retry', { item: 'i-404' }],
  ['item.wake', { item: 'i-404' }],
  ['item.release', { item: 'i-404' }],
  ['item.note', { item: 'i-404', text: 'A note' }],
  [
    'item.signoff',
    {
      item: 'i-404',
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      verdict: 'approve',
    },
  ],
  ['plan.defer', { item: 'i-404', reason: 'later' }],
  ['plan.expedite', { items: ['i-404'], reason: 'now' }],
  ['relation.add', { source: 'i-404', type: 'blocks', target: 'i-404' }],
  ['report.cost', { item: 'i-404' }],
  ['item.file', { repo: 'example/app', title: 'T', outcome: 'O', blockedBy: ['i-404'] }],
])(
  'it answers not found on %s for a short reference that no item has',
  async (procedure, input) => {
    const ctx = await setupTest();

    await ctx.dispatch.seedItem({});

    const answer = await ctx.callOwner(procedure, input);

    expect(answer).toMatchObject({
      status: 404,
      body: { json: { code: 'NOT_FOUND', data: { item: 'i-404' } } },
    });
  },
);

test.each<[string, 'plain' | 'held' | 'atSignoff', (item: string) => unknown]>([
  ['item.get', 'plain', (item: string) => ({ item })],
  ['item.edit', 'plain', (item: string) => ({ item, title: 'A new title' })],
  ['item.close', 'plain', (item: string) => ({ item, reason: 'no longer needed' })],
  ['item.retry', 'plain', (item: string) => ({ item })],
  ['item.wake', 'plain', (item: string) => ({ item })],
  ['item.release', 'held', (item: string) => ({ item })],
  ['item.note', 'plain', (item: string) => ({ item, text: 'A note' })],
  [
    'item.signoff',
    'atSignoff',
    (item: string) => ({
      item,
      head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
      verdict: 'approve',
    }),
  ],
  ['plan.defer', 'plain', (item: string) => ({ item, reason: 'later' })],
  ['plan.undefer', 'plain', (item: string) => ({ item })],
  ['plan.expedite', 'plain', (item: string) => ({ items: [item], reason: 'now' })],
  ['plan.unexpedite', 'plain', (item: string) => ({ item })],
  ['report.cost', 'plain', (item: string) => ({ item })],
  ['report.stageTimes', 'plain', (item: string) => ({ item })],
])('it takes a short reference in place of the ID on %s', async (procedure, seed, build) => {
  const refCtx = await setupTest();
  const idCtx = await setupTest();
  const refItem = await refCtx.seed[seed]();
  const idItem = await idCtx.seed[seed]();
  const refAnswer = await refCtx.callOwner(procedure, build('i-1'));
  const idAnswer = await idCtx.callOwner(procedure, build(idItem));
  const refStored = await refCtx.readItem(refItem);
  const idStored = await idCtx.readItem(idItem);
  const refLevers = await refCtx.dispatch.listFacts('boxxy.lever.recorded');
  const idLevers = await idCtx.dispatch.listFacts('boxxy.lever.recorded');
  const refEdits = await refCtx.dispatch.listFacts('boxxy.item.edited');
  const idEdits = await idCtx.dispatch.listFacts('boxxy.item.edited');
  const refCloses = await refCtx.dispatch.listFacts('boxxy.item.closed');
  const idCloses = await idCtx.dispatch.listFacts('boxxy.item.closed');

  const byRef = {
    answer: refAnswer,
    stored: refStored,
    facts: [refLevers, refEdits, refCloses].map((list) => list.map((fact) => fact.payload)),
  };

  const byID = {
    answer: idAnswer,
    stored: idStored,
    facts: [idLevers, idEdits, idCloses].map((list) => list.map((fact) => fact.payload)),
  };

  expect(refAnswer.status).toBe(200);
  expect(byRef).toStrictEqual(byID);
});

test('it takes short references on relation.add and relation.remove in place of the IDs', async () => {
  const ctx = await setupTest();
  const source = await ctx.dispatch.seedItem({});
  const target = await ctx.dispatch.seedItem({});

  const link = { source: 'i-1', target: 'i-2', type: 'blocks' };

  const added = await ctx.callOwner('relation.add', link);
  const facts = await ctx.dispatch.listFacts('boxxy.relation.added');
  const removed = await ctx.callOwner('relation.remove', link);
  const removedAgain = await ctx.callOwner('relation.remove', link);

  expect([added.body, removed.body, removedAgain.body]).toStrictEqual([
    { json: { kind: 'added' } },
    { json: { removed: true } },
    { json: { removed: false } },
  ]);

  expect(facts.map((fact) => fact.payload)).toStrictEqual([
    expect.objectContaining({ source, target, type: 'blocks' }),
  ]);
});

test('#file answers the short reference of the item it filed', async () => {
  const ctx = await setupTest();
  const first = await ctx.callOwner('item.file', { repo: 'example/app', title: 'A', outcome: 'B' });

  const second = await ctx.callOwner('item.file', {
    repo: 'example/app',
    title: 'C',
    outcome: 'D',
  });

  expect([first.body, second.body]).toStrictEqual([
    { json: { item: expect.any(String), ref: 'i-1' } },
    { json: { item: expect.any(String), ref: 'i-2' } },
  ]);
});

test('#file with blockedBy takes a short reference', async () => {
  const ctx = await setupTest();
  const blocker = await ctx.dispatch.seedItem({});

  const filed = await ctx.readAnswer('item.file', {
    repo: 'example/app',
    title: 'Check a widget',
    outcome: 'The widget passes.',
    blockedBy: ['i-1'],
  });

  const stored = await ctx.readItem(brandSchemas.itemId.parse(filed.item));
  const facts = await ctx.dispatch.listFacts('boxxy.relation.added');

  expect([stored?.derived.state, facts.map((fact) => fact.payload)]).toStrictEqual([
    'blocked',
    [expect.objectContaining({ source: blocker, target: filed.item })],
  ]);
});

test('#get lists each attempt as a summary without its launch prompt or input', async () => {
  const ctx = await setupTest();
  const first = await ctx.dispatch.seedBuild();

  await ctx.dispatch.seedReworkAfter(first);

  const rows = await ctx.deps.store.read((tx) => tx.listItemAttempts(first.item));
  const answer = await ctx.callOwner('item.get', { item: first.item });

  const shape = z.object({ json: z.object({ attempts: z.array(attemptSummarySchema) }) });
  const shown = shape.parse(answer.body).json.attempts;

  expect(JSON.stringify(first.spawnRequest).length).toBeGreaterThan(500);

  expect(
    shown.map((attempt) => [
      attempt.phase,
      attempt.number,
      attempt.state,
      attempt.failure,
      attempt.claimedAt,
      attempt.startedAt,
      attempt.endedAt,
    ]),
  ).toStrictEqual(
    rows.map((row) => [
      row.phase,
      row.number,
      row.state,
      row.failure,
      row.claimedAt,
      row.startedAt,
      row.endedAt,
    ]),
  );
});
