import type { GrantScope } from '@boxxy/contract';
import type { MCPAuth } from '@zgeoff/mcp-auth';
import { reloadServiceTokens } from './reload-service-tokens.ts';
import type { ServiceTokenReload } from './reload-service-tokens.ts';

export interface ServiceTokenReloads {
  readonly auth: Pick<MCPAuth<GrantScope>, 'replaceServiceTokens'>;
  readonly path: string;
  readonly onReload: (reload: ServiceTokenReload) => void;
}

// Each SIGHUP reads the service-token file again and reports the outcome. Reloads run one at a
// time, so an older read never lands after a newer one. The returned function stops listening and
// waits for the last reload.
export function startServiceTokenReloads(reloads: ServiceTokenReloads): () => Promise<void> {
  let reloading = Promise.resolve();

  const onHangUp = (): void => {
    const previous = reloading;

    reloading = (async () => {
      await previous;
      await runReload(reloads);
    })();
  };

  process.on('SIGHUP', onHangUp);

  return async () => {
    process.off('SIGHUP', onHangUp);

    await reloading;
  };
}

async function runReload(reloads: ServiceTokenReloads): Promise<void> {
  const reload = await reloadServiceTokens(reloads.auth, reloads.path).catch(
    (error: unknown): ServiceTokenReload => ({
      kind: 'kept',
      reason: `the reload failed: ${String(error)}`,
    }),
  );

  // a report that throws must not reject the chain, which would skip every later reload and fail
  // the door's stop; stderr is the one place left to say so
  try {
    reloads.onReload(reload);
  } catch (error) {
    process.stderr.write(`the service-token reload was not reported: ${String(error)}\n`);
  }
}
