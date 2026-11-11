import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { StoreDatabase } from '../types.ts';

// no later attempt carries the same atc session; claim time, then id, orders the attempts
export function isLatestOfSession(
  builder: ExpressionBuilder<StoreDatabase, 'attempts'>,
): Expression<SqlBool> {
  const later = builder
    .selectFrom('attempts as later')
    .select('later.id')
    .whereRef('later.atc_session', '=', 'attempts.atc_session')
    .where((inner) => {
      const claimedAt = inner.ref('attempts.claimed_at');
      const sameTime = inner('later.claimed_at', '=', claimedAt);
      const higherId = inner('later.id', '>', inner.ref('attempts.id'));

      return inner.or([inner('later.claimed_at', '>', claimedAt), inner.and([sameTime, higherId])]);
    });

  return builder.not(builder.exists(later));
}
