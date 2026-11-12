import type { GateCost } from '@boxxy/model';
import type { ReviewResult } from '@noslop/cli';

// A call with no model ran on the adapter's default model, so the adapter's name stands in.
export function buildGateCost(review: ReviewResult): GateCost {
  return {
    calls: review.calls.map((call) => ({
      model: call.model ?? call.adapter,
      input: call.tokens.input,
      cachedInput: call.tokens.cachedInput,
      cacheWrite: call.tokens.cacheWrite,
      output: call.tokens.output,
      durationMs: call.durationMs,
    })),
  };
}
