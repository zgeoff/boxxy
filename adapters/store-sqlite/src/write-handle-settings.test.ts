import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { writeHandleSettings } from './write-handle-settings.ts';

function setupTest() {
  const handle = new Database(':memory:');

  onTestFinished(() => {
    handle.close();
  });

  return {
    handle,
    readSetting: (name: string) => handle.query(`PRAGMA ${name}`).values()[0]?.[0],
  };
}

test('it keeps the temp files of the handle in memory, so the store needs no temp folder', () => {
  const ctx = setupTest();

  writeHandleSettings(ctx.handle, 0);

  // 2 is MEMORY
  expect(ctx.readSetting('temp_store')).toBe(2);
});

test('it sets the busy timeout of the handle', () => {
  const ctx = setupTest();

  writeHandleSettings(ctx.handle, 1500);

  expect(ctx.readSetting('busy_timeout')).toBe(1500);
});
