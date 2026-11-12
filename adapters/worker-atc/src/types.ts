import type { z } from 'zod';
import type { atcToolResults } from './mcp/atc-tool-results.ts';

export type AtcToolName = keyof typeof atcToolResults;

type AtcToolResult<Name extends AtcToolName> = z.output<(typeof atcToolResults)[Name]>;

// `host` is the VM host that runs the session: sub-sessions on one machine share it, and a session
// with no VM host has none. atc reports no usage limit.
export type AtcSession = AtcToolResult<'atc_session_spawn'>;

// `atc_session_get`'s result. `lastActivityAt` is the time of the session's last trail event, in
// milliseconds, or its creation time when it has none.
export type AtcSessionRead = AtcToolResult<'atc_session_get'>;

// atc's git workspace source: atc clones it into a folder it picks on the target, with the token
// in the daemon's environment variable that `credentialRef` names
interface AtcGitWorkspace {
  readonly kind: 'git';
  readonly url: string;
  readonly ref: string;
  readonly credentialRef?: { readonly kind: 'env'; readonly name: string };
}

// `cwd` for a folder on the target, or `workspace` with `trustClonedWorkspace`, never both
export type AtcSpawnPlace =
  | { readonly cwd: string }
  | { readonly workspace: AtcGitWorkspace; readonly trustClonedWorkspace: boolean };

type AtcSpawnInput = {
  readonly target: string;
  readonly name: string;
  readonly prompt: string;
  readonly agent: string;
  readonly model: string;
  readonly effort: string;
  readonly idempotencyKey: string;
} & AtcSpawnPlace;

interface AtcForgetInput {
  readonly session: string;
  readonly confirmToken?: string;
}

interface AtcMessageInput {
  // the id or the name of the session that gets the message
  readonly session: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

// The atc tools the adapter calls, each with its parsed result. A call that atc refuses, or whose
// result fails the parse, rejects with an `AtcCallError`; a call that got no atc answer rejects with
// any other error.
export interface AtcClient {
  readonly listSessions: () => Promise<AtcToolResult<'atc_sessions_list'>>;
  readonly readSession: (session: string) => Promise<AtcSessionRead>;
  readonly spawnSession: (input: AtcSpawnInput) => Promise<AtcSession>;
  readonly stopSession: (session: string) => Promise<AtcToolResult<'atc_session_stop'>>;
  readonly adoptSession: (session: string) => Promise<AtcToolResult<'atc_session_adopt'>>;
  readonly forgetSession: (input: AtcForgetInput) => Promise<AtcToolResult<'atc_session_forget'>>;
  readonly sendMessage: (input: AtcMessageInput) => Promise<AtcToolResult<'atc_message_send'>>;
}
