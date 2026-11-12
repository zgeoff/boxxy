import { expect, test } from 'bun:test';
import { runCLI } from '../cli/run-cli.ts';
import { buildMockCLIDeps } from '../test-utils/build-mock-cli-deps.ts';

function setupTest() {
  const bodies: unknown[] = [];

  const send = async (request: Request): Promise<Response> => {
    const sent: unknown = await request.json();

    bodies.push(sent);

    return Response.json({ json: { item: 'i-1' } });
  };

  return {
    bodies,
    fileFlags: ['item', 'file', '--repo', 'acme/widgets', '--title', 'T', '--outcome', 'O'],
    run: (argv: readonly string[]) =>
      runCLI(
        {
          ...buildMockCLIDeps({ BOXXY_URL: 'http://boxxy.test' }),
          send,
          readStdin: () => Promise.resolve('Body from stdin'),
          readFile: (path) => Promise.resolve(`Body of ${path}`),
        },
        argv,
      ),
  };
}

test.each([
  ['--body text', ['--body', 'Typed body'], 'Typed body'],
  [
    '--body-file a path',
    ['--body-file', '/tmp/boxxy-test/body.md'],
    'Body of /tmp/boxxy-test/body.md',
  ],
  ['--body-file -', ['--body-file', '-'], 'Body from stdin'],
])('it sends the body of item file given as %s', async (_title, flags, expected) => {
  const ctx = setupTest();

  await ctx.run([...ctx.fileFlags, ...flags]);

  expect(ctx.bodies).toStrictEqual([{ json: expect.objectContaining({ body: expected }) }]);
});

test('it sends no body for item edit when no body flag is given', async () => {
  const ctx = setupTest();

  await ctx.run(['item', 'edit', 'i-1', '--title', 'A new title']);

  expect(ctx.bodies).toStrictEqual([{ json: { item: 'i-1', title: 'A new title' } }]);
});

test('it sends the body of item edit from a file', async () => {
  const ctx = setupTest();

  await ctx.run(['item', 'edit', 'i-1', '--body-file', 'body.md']);

  expect(ctx.bodies).toStrictEqual([{ json: { item: 'i-1', body: 'Body of body.md' } }]);
});

test('it exits 2 when item file gets both --body and --body-file', async () => {
  const ctx = setupTest();

  const result = await ctx.run([...ctx.fileFlags, '--body', 'x', '--body-file', 'y']);

  expect([result, ctx.bodies]).toStrictEqual([
    { exitCode: 2, stdout: '', stderr: 'error: give --body or --body-file, not both\n' },
    [],
  ]);
});
