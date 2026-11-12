import type { Command } from '../types.ts';
import { attemptCommands } from './attempt-commands.ts';
import { authCommands } from './auth-commands.ts';
import { hookCommands } from './hook-commands.ts';
import { itemCommands } from './item-commands.ts';
import { planCommands } from './plan-commands.ts';
import { relationCommands } from './relation-commands.ts';
import { reportCommands } from './report-commands.ts';
import { runnerCommands } from './runner-commands.ts';

// One command for each procedure of the contract.
export const allCommands: readonly Command[] = [
  ...itemCommands,
  ...relationCommands,
  ...planCommands,
  ...runnerCommands,
  ...authCommands,
  ...reportCommands,
  ...attemptCommands,
  ...hookCommands,
];
