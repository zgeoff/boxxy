import type { AtcCallError } from './mcp/atc-call-error.ts';

// The one place that decides that the worker target has no free machine. atc's imp provider refuses
// a host it cannot ready with `host_unavailable`, and puts impd's own error code, in lower case, in
// the refusal's `problem`; impd answers `RAM_BUDGET_EXCEEDED` when no budget is left for another imp.
export function isCapacityRefusal(error: AtcCallError): boolean {
  return error.code === 'host_unavailable' && error.problem === 'ram_budget_exceeded';
}
