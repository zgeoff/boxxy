import type { PluginClient } from '@pepys/kit';
import type { buildBoxxyPlugin } from './build-boxxy-plugin.ts';

// The typed client of the plug-in's two queries on the pepys API's RPC route.
export type BoxxyQueryClient = PluginClient<ReturnType<typeof buildBoxxyPlugin>>;

// The same client as the reader takes it. Its types hold only when pepys runs this package's
// version, so the reader parses each answer. Any `BoxxyQueryClient` fits, and so does the pepys
// API's deployment client of a deployment that holds the plug-in.
export type UncheckedQueryClient = {
  readonly [Query in keyof BoxxyQueryClient]: (
    input: Parameters<BoxxyQueryClient[Query]>[0],
  ) => Promise<unknown>;
};
