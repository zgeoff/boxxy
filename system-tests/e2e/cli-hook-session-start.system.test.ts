import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkillsRepo } from '@boxxy/cli/test-utils/create-skills-repo';
import { brandSchemas } from '@boxxy/model';
import type { SkillsPin } from '@boxxy/model';
import { createTestCLI } from '../src/test-utils/create-test-cli.ts';

async function setupTest() {
  const cli = await createTestCLI();
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-hook-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const workspace = join(folder, 'workspace');
  const skillsFolder = join(folder, 'remote');

  const startHook = (agentSession: string, baseURL: string) =>
    cli.run(['hook', 'session-start'], {
      stdin: JSON.stringify({
        session_id: agentSession,
        cwd: workspace,
        hook_event_name: 'SessionStart',
        source: 'startup',
      }),
      env: { BOXXY_SKILLS_URL: baseURL },
    });

  // the example rules with the pin of the repository that the test made
  const pinSkills = (pin: Pick<SkillsPin, 'source'> & { ref: string }) => {
    const rules = cli.server.dispatch.rules();

    cli.server.dispatch.setRules({
      ...rules,
      skills: { source: pin.source, ref: brandSchemas.commitSha.parse(pin.ref) },
    });
  };

  return { ...cli, workspace, skillsFolder, startHook, pinSkills };
}

test('it fetches the listed skills into the workspace and binds the agent session', async () => {
  const ctx = await setupTest();

  const repo = await createSkillsRepo({
    folder: ctx.skillsFolder,
    skills: { 'bake-off': { 'SKILL.md': 'Three sketches.\n', 'notes.md': 'More.\n' } },
  });

  ctx.pinSkills(repo);

  const attempt = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('design'));

  ctx.server.callerProof.setCaller(attempt.caller);

  const before = await ctx.server.dispatch.listFacts('boxxy.attempt.session_bound');
  const result = await ctx.startHook('agent-session-1', repo.baseURL);
  const after = await ctx.server.dispatch.listFacts('boxxy.attempt.session_bound');
  const installed = await readFile(join(ctx.workspace, '.claude/skills/bake-off/SKILL.md'), 'utf8');

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
  expect(installed).toBe('Three sketches.\n');
  expect(after.length - before.length).toBe(1);
});

test('it ends the attempt as skill-missing when a listed skill is not in the pinned repository', async () => {
  const ctx = await setupTest();

  const repo = await createSkillsRepo({
    folder: ctx.skillsFolder,
    skills: { other: { 'SKILL.md': 'x' } },
  });

  ctx.pinSkills(repo);

  const attempt = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('design'));

  ctx.server.callerProof.setCaller(attempt.caller);

  const result = await ctx.startHook('agent-session-1', repo.baseURL);

  ctx.server.dispatch.worker.setSession(attempt.id, { state: 'suspended', asked: true });

  await ctx.server.tick();

  const settled = await ctx.server.dispatch.readAttempt(attempt.id);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr:
      'boxxy ends this attempt: the skills bake-off are not in the pinned skills repository\n',
  });

  expect([settled.state, settled.failure]).toStrictEqual(['failed', 'skill-missing']);
});

test('it ends the attempt as skill-missing when the skills repository cannot be fetched', async () => {
  const ctx = await setupTest();

  const repo = await createSkillsRepo({
    folder: ctx.skillsFolder,
    skills: { 'bake-off': { 'SKILL.md': 'x' } },
  });

  ctx.pinSkills(repo);

  const attempt = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('design'));

  ctx.server.callerProof.setCaller(attempt.caller);

  const result = await ctx.startHook('agent-session-1', join(ctx.skillsFolder, 'nowhere'));
  const after = await ctx.server.dispatch.readAttempt(attempt.id);

  expect([result.exitCode, after.state, after.closing]).toStrictEqual([
    1,
    'closing',
    'skill-missing',
  ]);
});

test('it binds without a fetch when the recipe lists no skill', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  ctx.server.callerProof.setCaller(attempt.caller);

  const result = await ctx.startHook('agent-session-1', join(ctx.skillsFolder, 'nowhere'));

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it waits and asks again when the server has no attempt for the session, then gives up', async () => {
  const ctx = await setupTest();

  ctx.server.callerProof.setCaller({ issuer: 'fake-worker', subject: 'another-machine' });

  const result = await ctx.startHook('agent-session-1', ctx.skillsFolder);

  expect({ exitCode: result.exitCode, stderr: result.stderr, slept: ctx.slept }).toStrictEqual({
    exitCode: 1,
    stderr: 'boxxy has no attempt for this session\n',
    slept: [5000, 5000, 5000, 5000, 5000],
  });
});

test('it exits 1 and names the holder when the agent session is bound to another attempt', async () => {
  const ctx = await setupTest();
  const first = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));
  const second = await ctx.server.seedStartedAttempt(brandSchemas.phaseName.parse('triage'));

  ctx.server.callerProof.setCaller(first.caller);

  await ctx.startHook('agent-session-1', ctx.skillsFolder);

  ctx.server.callerProof.setCaller(second.caller);

  const result = await ctx.startHook('agent-session-1', ctx.skillsFolder);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 1,
    stderr: `this agent session is bound to attempt ${first.id}\n`,
  });
});

test('it exits 2 when the hook payload is not the one Claude Code sends', async () => {
  const ctx = await setupTest();
  const result = await ctx.run(['hook', 'session-start'], { stdin: '{"cwd":"/tmp/boxxy-test"}' });

  expect(result.exitCode).toBe(2);
});
