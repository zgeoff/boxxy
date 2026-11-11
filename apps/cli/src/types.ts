import type { ParseArgsOptionsConfig } from 'node:util';
import type { BoxxyClient, ProcedureName } from '@boxxy/contract';

export interface GitResult {
  readonly exitCode: number;
  readonly output: string;
}

// Everything the CLI reads from or does to the machine. `main.ts` builds the real one.
export interface CLIDeps {
  readonly env: Readonly<Record<string, string | undefined>>;

  // sends a request to the server. Only a test passes it; the real CLI lets the client use the
  // platform's fetch, so `HTTPS_PROXY` applies
  readonly send?: (request: Request) => Promise<Response>;
  readonly readStdin: () => Promise<string>;
  readonly readFile: (path: string) => Promise<string>;

  // runs `git` with the arguments, in the given folder when there is one
  readonly runGit: (args: readonly string[], folder?: string) => Promise<GitResult>;
  readonly sleep: (durationMs: number) => Promise<void>;
  readonly now: () => number;
}

export interface CLIResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// The flags and words of one command line, read through the command's option table.
export interface CommandArgs {
  // the word at the position; throws a usage error naming `label` when it is missing
  positional: (index: number, label: string) => string;

  // every word from the position on, at least one
  positionalsFrom: (index: number, label: string) => string[];
  string: (name: string) => string | undefined;
  requireString: (name: string) => string;
  strings: (name: string) => string[];
  integer: (name: string) => number | undefined;
  oneOf: <Choice extends string>(name: string, choices: readonly Choice[]) => Choice | undefined;
  requireOneOf: <Choice extends string>(name: string, choices: readonly Choice[]) => Choice;
}

export interface CommandCall {
  readonly client: BoxxyClient;
  readonly args: CommandArgs;
  readonly deps: CLIDeps;
}

export interface Command {
  // the words that name the command, such as `['item', 'file']`
  readonly path: readonly string[];
  readonly procedure: ProcedureName;
  readonly summary: string;
  readonly options: ParseArgsOptionsConfig;
  readonly run: (call: CommandCall) => Promise<CLIResult>;
}
