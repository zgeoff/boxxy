import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRulesHolder } from './create-rules-holder.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-rules-'));

  const example = path.dirname(
    Bun.fileURLToPath(import.meta.resolve('@boxxy/rules/example/rules.yaml')),
  );

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  await cp(example, folder, { recursive: true });

  const logged: string[] = [];

  return {
    folder,
    logged,
    log: { warn: (message: string) => logged.push(message) },
    readRulesFile: () => Bun.file(path.join(folder, 'rules.yaml')).text(),
    writeRulesFile: (text: string) => Bun.write(path.join(folder, 'rules.yaml'), text),
  };
}

test('it loads the rules of a plain folder', async () => {
  const ctx = await setupTest();
  const answer = await createRulesHolder(ctx.folder, ctx.log);

  expect(answer.kind === 'loaded' && answer.holder.state().rules.commit).toBe('folder');
});

test('it keeps the rules and records the refusal when a reload is refused', async () => {
  const ctx = await setupTest();
  const answer = await createRulesHolder(ctx.folder, ctx.log);

  await ctx.writeRulesFile('not: [valid rules\n');

  const holder = answer.kind === 'loaded' ? answer.holder : null;
  const before = holder?.state().rules.version;

  await holder?.reload();

  expect({
    version: holder?.state().rules.version,
    refused: holder?.state().lastRejected?.commit,
    logged: ctx.logged,
  }).toStrictEqual({
    version: before,
    refused: 'folder',
    logged: ['the rules load was refused; the rules stay'],
  });
});

test('it loads a changed rules file on reload', async () => {
  const ctx = await setupTest();
  const answer = await createRulesHolder(ctx.folder, ctx.log);

  const holder = answer.kind === 'loaded' ? answer.holder : null;
  const before = holder?.state().rules.version;

  const text = await ctx.readRulesFile();

  await ctx.writeRulesFile(`${text}\n# a comment changes the bytes\n`);
  await holder?.reload();

  expect(holder?.state().rules.version).not.toBe(before);
});

test('it refuses a folder whose rules do not load', async () => {
  const ctx = await setupTest();

  await ctx.writeRulesFile('not: [valid rules\n');

  const answer = await createRulesHolder(ctx.folder, ctx.log);

  expect(answer.kind).toBe('refused');
});
