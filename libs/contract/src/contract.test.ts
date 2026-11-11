import { expect, test } from 'bun:test';
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

test('it holds exactly 26 procedures', () => {
  const ctx = setupTest();

  expect(ctx.procedures).toHaveLength(26);
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

test('it lists 17 owner tools, 3 session tools and 6 procedures with no tool', () => {
  const ctx = setupTest();
  const rows = [...ctx.rows.values()];

  expect(
    ['owner', 'session', 'none'].map((tool) => rows.filter((row) => row.tool === tool).length),
  ).toStrictEqual([17, 3, 6]);
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
