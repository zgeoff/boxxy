import type {
  AttemptRow,
  EngineOutcome,
  ForcedFailure,
  Instant,
  ItemView,
  LoadedRules,
  OutcomeName,
  Settlement,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

interface SettlementInput {
  readonly attempt: AttemptRow;
  readonly item: ItemView;
  readonly rules: LoadedRules;
  readonly forced: ForcedFailure | null;
  readonly now: Instant;
}

export interface PickedSettlement extends Omit<Settlement, 'outcome'> {
  readonly outcome: OutcomeName | EngineOutcome;

  // the name the phase code returned that its kind does not list; else null
  readonly returnedOutcome: string | null;
}

// How the attempt ends. Never throws: phase code that throws, or answers an outcome its kind
// does not list, gives `unsettleable`. The returned name is never stored as the outcome, so a
// rollback to rules that map it cannot move the item on with no effect applied.
export function pickSettlement(input: SettlementInput): PickedSettlement {
  const closeOut = input.attempt.closeOut;

  if (closeOut === null || input.forced !== null) {
    return {
      state: 'failed',
      failure: input.forced ?? 'closeout-missing',
      outcome: 'lost',
      returnedOutcome: null,
      effects: [],
      frictionDropped: 0,
    };
  }

  const phase = input.rules.phases.get(input.attempt.phase);

  if (phase === undefined) {
    return buildUnsettleable(null);
  }

  try {
    const settlement = phase.settle({
      attempt: input.attempt,
      item: input.item,
      closeOut,
      now: input.now,
    });

    return phase.outcomes.includes(settlement.outcome)
      ? {
          ...settlement,
          outcome: brandSchemas.outcomeName.parse(settlement.outcome),
          returnedOutcome: null,
        }
      : buildUnsettleable(settlement.outcome);
  } catch {
    return buildUnsettleable(null);
  }
}

function buildUnsettleable(returnedOutcome: string | null): PickedSettlement {
  return {
    state: 'failed',
    failure: 'closeout-unsettleable',
    outcome: 'unsettleable',
    returnedOutcome,
    effects: [],
    frictionDropped: 0,
  };
}
