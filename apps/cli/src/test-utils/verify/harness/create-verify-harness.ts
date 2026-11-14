import { join } from 'node:path';
import { brandSchemas } from '@boxxy/model';
import { createTestServer } from '@boxxy/server/test-utils/create-test-server';
import { startPepysUnderTest } from '@boxxy/server/test-utils/start-pepys-under-test';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { createSkillsRepo } from '../../create-skills-repo.ts';
import { createRecordingNotifier } from './create-recording-notifier.ts';
import type { SentNotice, VerifyHarness } from './types.ts';

// The parts of the CLI's item-to-merge journey test, built the same way: the real server on the
// SQLite store in the run folder, the fake clock, worker, forge, caller proof and notifier, pepys
// under test, and a local skills repo that the rules pin.
export async function createVerifyHarness(runDirectory: string): Promise<VerifyHarness> {
  const store = await createSQLiteClaimStore(join(runDirectory, 'boxxy.db'));
  const pepys = await startPepysUnderTest();

  const notices: SentNotice[] = [];

  const server = await createTestServer({
    store,
    pepys: pepys.reader,
    makeNotifier: (claimStore) => createRecordingNotifier(claimStore, notices),
  });

  const skills = await createSkillsRepo({
    folder: join(runDirectory, 'skills'),
    skills: { 'bake-off': { 'SKILL.md': 'Sketch three designs.\n' } },
  });

  server.dispatch.setRules({
    ...server.dispatch.rules(),
    skills: { source: skills.source, ref: brandSchemas.commitSha.parse(skills.ref) },
  });

  return {
    server,
    pepys,
    skillsURL: skills.baseURL,
    runDirectory,
    current: null,
    peers: [],
    notices,
    currentSince: server.dispatch.clock.now(),
    openedPullRequest: null,
    nextPullRequest: 1,
    [Symbol.asyncDispose]: async () => {
      await pepys[Symbol.asyncDispose]();
      await store.close();
    },
  };
}
