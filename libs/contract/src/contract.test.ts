import { expect, expectTypeOf, test } from 'bun:test';
import type { OutboxStatus } from '@boxxy/model';
import type { InferContractRouterOutputs } from '@orpc/contract';
import { z } from 'zod';
import { access } from './access.ts';
import { contract } from './contract.ts';

function setupTest() {
  const toolMetaSchema = z.object({ name: z.string() });
  const metaSchema = z.object({ '~mcp/tool': toolMetaSchema.optional() }).loose();

  const definitionSchema = z.object({
    inputSchemas: z.array(z.custom<z.ZodType>()),
    outputSchemas: z.array(z.custom<z.ZodType>()),
    meta: metaSchema,
  });

  const procedureSchema = z.object({ '~orpc': definitionSchema });

  interface Procedure {
    readonly name: string;
    readonly inputs: readonly z.ZodType[];
    readonly outputs: readonly z.ZodType[];
    readonly tool: string | undefined;
  }

  const collectProcedures = (node: unknown, path: readonly string[]): Procedure[] => {
    const procedure = procedureSchema.safeParse(node);

    if (procedure.success) {
      const definition = procedure.data['~orpc'];

      return [
        {
          name: path.join('.'),
          inputs: definition.inputSchemas,
          outputs: definition.outputSchemas,
          tool: definition.meta['~mcp/tool']?.name,
        },
      ];
    }

    if (typeof node !== 'object' || node === null) {
      return [];
    }

    return Object.entries(node).flatMap(([key, child]) => collectProcedures(child, [...path, key]));
  };

  const procedures = collectProcedures(contract, []);

  return {
    procedures,
    names: procedures.map((procedure) => procedure.name),
    rows: new Map(Object.entries(access)),
  };
}

test('it holds exactly 33 procedures', () => {
  const ctx = setupTest();

  expect(ctx.procedures).toHaveLength(33);
});

test('it gives every procedure exactly one access row, and every access row a procedure', () => {
  const ctx = setupTest();

  expect([...ctx.rows.keys()].toSorted()).toStrictEqual(ctx.names.toSorted());
});

test('it gives every access row a valid caller, actor and tool', () => {
  const ctx = setupTest();

  const actors = {
    owner: ['boxxy:owner:local', 'none'],
    session: ['none', 'boxxy:attempt:<id>'],
    hook: ['none', 'boxxy:hook:<id>'],
  };

  const invalid = [...ctx.rows].filter(
    ([, row]) =>
      !['owner', 'session', 'none'].includes(row.tool) || !actors[row.caller].includes(row.actor),
  );

  expect(invalid).toStrictEqual([]);
});

test('it lists a procedure as a tool only on the endpoint of its caller', () => {
  const ctx = setupTest();
  const invalid = [...ctx.rows].filter(([, row]) => row.tool !== 'none' && row.tool !== row.caller);

  expect(invalid).toStrictEqual([]);
});

test('it lists 20 owner tools, 3 session tools and 10 procedures with no tool', () => {
  const ctx = setupTest();
  const rows = [...ctx.rows.values()];

  expect(
    ['owner', 'session', 'none'].map((tool) => rows.filter((row) => row.tool === tool).length),
  ).toStrictEqual([20, 3, 10]);
});

test('it gives the procedures that file held, release or list held items to the owner alone', () => {
  const ctx = setupTest();
  const names = ['item.file', 'item.release', 'item.list'];

  expect(names.map((name) => ctx.rows.get(name)?.caller)).toStrictEqual([
    'owner',
    'owner',
    'owner',
  ]);
});

test('it gives every owner tool a scope of read or write', () => {
  const ctx = setupTest();
  const tools = [...ctx.rows].filter(([, row]) => row.tool === 'owner');

  expect(tools.filter(([, row]) => row.scope !== 'read' && row.scope !== 'write')).toStrictEqual(
    [],
  );
});

test('it gives every procedure that changes state the write scope', () => {
  const ctx = setupTest();

  const writes = [
    'item.file',
    'item.edit',
    'item.close',
    'item.retry',
    'item.wake',
    'item.release',
    'item.note',
    'relation.add',
    'relation.remove',
    'plan.defer',
    'plan.undefer',
    'plan.expedite',
    'plan.unexpedite',
    'runner.pause',
    'runner.resume',
  ];

  expect(writes.filter((name) => ctx.rows.get(name)?.scope !== 'write')).toStrictEqual([]);
});

test('it gives each read tool the read scope', () => {
  const ctx = setupTest();
  const reads = ['item.get', 'item.list', 'runner.status', 'report.cost', 'report.stageTimes'];

  expect(reads.filter((name) => ctx.rows.get(name)?.scope !== 'read')).toStrictEqual([]);
});

test('it gives a session or hook procedure no scope', () => {
  const ctx = setupTest();
  const rows = [...ctx.rows].filter(([, row]) => row.caller !== 'owner');

  expect(rows.filter(([, row]) => row.scope !== 'none')).toStrictEqual([]);
});

test('it names an MCP tool on a procedure exactly when its access row lists a tool', () => {
  const ctx = setupTest();

  const invalid = ctx.procedures.filter(
    (procedure) =>
      (procedure.tool !== undefined) !== (ctx.rows.get(procedure.name)?.tool !== 'none'),
  );

  expect(invalid.map((procedure) => procedure.name)).toStrictEqual([]);
});

test('it names each MCP tool after its procedure in snake case', () => {
  const ctx = setupTest();

  const names = ctx.procedures.flatMap((procedure) =>
    procedure.tool === undefined
      ? []
      : [
          [
            procedure.tool,
            procedure.name
              .replace('.', '_')
              .replaceAll(/[A-Z]/gu, (letter: string) => `_${letter.toLowerCase()}`),
          ],
        ],
  );

  expect(names.filter(([tool, expected]) => tool !== expected)).toStrictEqual([]);
});

test('it gives every procedure one input schema and one output schema', () => {
  const ctx = setupTest();

  const invalid = ctx.procedures.filter(
    (procedure) => procedure.inputs.length !== 1 || procedure.outputs.length !== 1,
  );

  expect(invalid.map((procedure) => procedure.name)).toStrictEqual([]);
});

test('it uses no transform in an input schema', () => {
  const ctx = setupTest();
  const inputs = ctx.procedures.flatMap((procedure) => procedure.inputs);

  // a transform has no output-side JSON Schema, so the conversion throws on one
  expect(() => inputs.map((input) => z.toJSONSchema(input, { io: 'output' }))).not.toThrow();
});

test('it gives every tool an input and an output that convert to a JSON Schema', () => {
  const ctx = setupTest();
  const tools = ctx.procedures.filter((procedure) => procedure.tool !== undefined);
  const inputs = tools.flatMap((procedure) => procedure.inputs);
  const outputs = tools.flatMap((procedure) => procedure.outputs);

  expect(() => [
    ...inputs.map((input) => z.toJSONSchema(input, { io: 'input' })),
    ...outputs.map((output) => z.toJSONSchema(output, { io: 'output' })),
  ]).not.toThrow();
});

test('it gives the CLI strings the flags that the inputs have', () => {
  expect([
    access['item.file'].cli,
    access['item.edit'].cli,
    access['item.list'].cli,
    access['item.close'].cli,
  ]).toStrictEqual([
    expect.stringContaining('[--label]'),
    expect.stringContaining('[--label]'),
    expect.stringContaining('[--text] [--label]'),
    expect.stringContaining('[--of]'),
  ]);
});

test('it gives runner.status an outbox output that equals the model status type', () => {
  type WireOutbox = InferContractRouterOutputs<typeof contract>['runner']['status']['outbox'];

  expectTypeOf<WireOutbox>().toEqualTypeOf<OutboxStatus>();
});

test.each([
  ['item.file', { repo: 'acme/widgets', title: 'T', outcome: 'O' }],
  ['item.edit', { item: 'i-1' }],
])('it accepts a body of 40,000 characters and refuses one of 40,001 for %s', (name, base) => {
  const ctx = setupTest();
  const input = ctx.procedures.find((procedure) => procedure.name === name)?.inputs[0] ?? z.never();

  expect([
    input.safeParse({ ...base, body: 'a'.repeat(40_000) }).success,
    input.safeParse({ ...base, body: 'a'.repeat(40_001) }).success,
  ]).toStrictEqual([true, false]);
});

test('it gives an item filed with no body an empty body', () => {
  const ctx = setupTest();

  const input =
    ctx.procedures.find((procedure) => procedure.name === 'item.file')?.inputs[0] ?? z.never();

  expect(input.safeParse({ repo: 'acme/widgets', title: 'T', outcome: 'O' }).data).toMatchObject({
    body: '',
  });
});

test('it leaves the body out of a row of item.list and keeps it in item.get', () => {
  const ctx = setupTest();

  const outputOf = (name: string) =>
    z.toJSONSchema(
      ctx.procedures.find((procedure) => procedure.name === name)?.outputs[0] ?? z.never(),
      {
        io: 'output',
      },
    );

  expect([
    JSON.stringify(outputOf('item.list')).includes('"body"'),
    JSON.stringify(outputOf('item.get')).includes('"body"'),
  ]).toStrictEqual([false, true]);
});
