import { createVerifyHarness } from './create-verify-harness.ts';
import { serveHarness } from './serve-harness.ts';

// The process that `bun verify up` launches. It reads one variable, builds the harness, serves the
// two listeners on localhost, and prints one ready line once both answer. A failure before that
// ends the process with code 1 and the cause on stderr.
const directory = process.env['BOXXY_VERIFY_DIR'];

if (directory === undefined) {
  console.error('set BOXXY_VERIFY_DIR; `bun verify up` sets it');
  process.exit(1);
}

try {
  const harness = await createVerifyHarness(directory);
  const listeners = await serveHarness(harness);

  console.log(
    JSON.stringify({
      event: 'listening',
      boxxy: listeners.boxxy,
      control: listeners.control,
      skills: harness.skillsURL,
    }),
  );

  const stopped = Promise.withResolvers<null>();

  process.once('SIGTERM', () => {
    stopped.resolve(null);
  });

  await stopped.promise;

  await listeners.stop();
  await harness[Symbol.asyncDispose]();

  process.exit(0);
} catch (error) {
  const cause = error instanceof Error ? (error.stack ?? error.message) : String(error);

  console.error(cause);
  process.exit(1);
}
