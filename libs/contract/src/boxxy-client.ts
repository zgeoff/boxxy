import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from './contract.ts';

// The typed client of the contract, as `createORPCClient` builds it.
export type BoxxyClient = ContractRouterClient<typeof contract>;
