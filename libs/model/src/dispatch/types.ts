import type { ContentHash } from '@boxxy/content-hash';
import type { SpawnRequest } from '../ports/types.ts';
import type {
  SliceOneAttemptRow,
  SliceOneLiveAttemptState,
  SliceOneSessionReading,
  SliceOneSpawnRequest,
} from '../slice-one/types.ts';
import type { AttemptRow, KnownFailure, Minutes, RecipeName, RepoName } from '../types.ts';

// The second kind is `wake`: the claim of a sleeping attempt, which the worker resumes.
export type Claim =
  | { readonly kind: 'start'; readonly attempt: AttemptRow; readonly spawn: SpawnRequest }
  | { readonly kind: 'wake'; readonly attempt: AttemptRow };

// The claim of slice 1, which the runner still makes.
export interface SliceOneClaim {
  readonly attempt: SliceOneAttemptRow;
  readonly spawn: SliceOneSpawnRequest;
}

export interface SpawnContext {
  readonly repoPaths: ReadonlyMap<RepoName, string>;
  readonly pluginFolder: { readonly path: string; readonly hash: ContentHash };
  readonly promptTemplates: ReadonlyMap<RecipeName, string>;
}

export type ReconcileAction =
  | {
      readonly kind: 'move-to-running';
      readonly fact: 'boxxy.attempt.started' | 'boxxy.attempt.reconciled';
    }
  | { readonly kind: 'bind-session' }
  | { readonly kind: 'settle' }
  | { readonly kind: 'fail'; readonly failure: Extract<KnownFailure, 'session-lost'> }
  | {
      readonly kind: 'respawn';
      readonly giveUpAfter: Minutes;
      readonly then: Extract<KnownFailure, 'spawn-lost'>;
    };

export type ReconcileTable = Readonly<
  Record<
    SliceOneSessionReading['kind'],
    Readonly<Record<SliceOneLiveAttemptState, ReconcileAction>>
  >
>;
