import type { OutgoingFact } from '@pepys/kit';
import type { boxxySource } from '../boxxy-source.ts';
import type { WorkFact } from '../work/types.ts';
import { buildMockAppliedFact } from './build-mock-applied-fact.ts';
import { toScopeFact } from './to-scope-fact.ts';

type AppliedFact = OutgoingFact<typeof boxxySource>;

interface ItemFacts {
  // the facts as boxxy's sink sends them
  readonly applied: AppliedFact[];

  // the same facts as the consumer reads them from the item's scope
  readonly facts: WorkFact[];
  readonly attempts: {
    readonly triage: string;
    readonly build: string;
    readonly review: string;
    readonly rebuild: string;
    readonly rereview: string;
  };
}

// One item's facts in time order, events `f01` to `f21`: a triage, a build that slept 20 minutes
// and linked pull request 9001, a review that asked for changes, a second build in the first
// build's atc session, and a review that passed.
export function buildMockItemFacts(): ItemFacts {
  const attempts = {
    triage: '0193a1b2-0000-7000-8000-0000000000a1',
    build: '0193a1b2-0000-7000-8000-0000000000a2',
    review: '0193a1b2-0000-7000-8000-0000000000a3',
    rebuild: '0193a1b2-0000-7000-8000-0000000000a4',
    rereview: '0193a1b2-0000-7000-8000-0000000000a5',
  };

  const applied = [
    buildItemFact('boxxy.item.filed', {
      event: 'f01',
      at: '2026-11-11T02:00:00.000Z',
      payload: {
        id: '0193a1b2-0000-7000-8000-000000000001',
        kind: 'core.issue',
        title: 'Chart the shoals',
        repo: 'shoal/charts',
      },
    }),
    buildClaimed('f02', '02:01:00', { attempt: attempts.triage, phase: 'triage', number: 1 }),
    buildStarted('f03', '02:01:05', attempts.triage, 's-triage'),
    buildSettled('f04', '02:05:00', { attempt: attempts.triage, outcome: 'accepted' }),
    buildClaimed('f05', '02:10:00', { attempt: attempts.build, phase: 'build', number: 1 }),
    buildStarted('f06', '02:10:05', attempts.build, 's-build'),
    buildItemFact('boxxy.attempt.session_bound', {
      event: 'f07',
      at: '2026-11-11T02:10:05.000Z',
      payload: {
        attempt: attempts.build,
        atcSession: 's-build',
        agentSession: 'agent-7',
        product: 'claude_code',
      },
    }),
    buildItemFact('boxxy.pull_request.linked', {
      event: 'f08',
      at: '2026-11-11T02:25:00.000Z',
      payload: { attempt: attempts.build, pullRequestId: '9001' },
    }),
    buildMark('boxxy.attempt.slept', 'f09', '02:30:00', attempts.build),
    buildMark('boxxy.attempt.woken', 'f10', '02:50:00', attempts.build),
    buildMark('boxxy.attempt.closed_out', 'f11', '03:09:00', attempts.build),
    buildSettled('f12', '03:10:00', { attempt: attempts.build, outcome: 'built' }),
    buildClaimed('f13', '03:16:00', { attempt: attempts.review, phase: 'review', number: 1 }),
    buildStarted('f14', '03:16:05', attempts.review, 's-review'),
    buildSettled('f15', '03:36:00', { attempt: attempts.review, outcome: 'changes-requested' }),
    buildClaimed('f16', '03:40:00', {
      attempt: attempts.rebuild,
      phase: 'build',
      number: 2,
      round: 2,
    }),
    buildStarted('f17', '03:40:05', attempts.rebuild, 's-build'),
    buildSettled('f18', '04:10:00', { attempt: attempts.rebuild, outcome: 'built', round: 2 }),
    buildClaimed('f19', '04:12:00', {
      attempt: attempts.rereview,
      phase: 'review',
      number: 2,
      round: 2,
    }),
    buildStarted('f20', '04:12:05', attempts.rereview, 's-rereview'),
    buildSettled('f21', '04:30:00', { attempt: attempts.rereview, outcome: 'passed', round: 2 }),
  ];

  return { applied, facts: applied.map((fact) => toScopeFact(fact)), attempts };
}

function buildItemFact(
  type: Parameters<typeof buildMockAppliedFact>[0],
  overrides: Parameters<typeof buildMockAppliedFact>[1],
): AppliedFact {
  return buildMockAppliedFact(type, {
    ...overrides,
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
  });
}

function buildClaimed(event: string, time: string, payload: Record<string, unknown>): AppliedFact {
  return buildItemFact('boxxy.attempt.claimed', {
    event,
    at: `2026-11-11T${time}.000Z`,
    payload: { round: 1, ...payload },
  });
}

function buildStarted(
  event: string,
  time: string,
  attempt: string,
  atcSession: string,
): AppliedFact {
  return buildItemFact('boxxy.attempt.started', {
    event,
    at: `2026-11-11T${time}.000Z`,
    payload: {
      attempt,
      atcSession,
      caller: { issuer: 'https://broker.example', subject: 'imp-builder' },
    },
  });
}

function buildSettled(event: string, time: string, payload: Record<string, unknown>): AppliedFact {
  return buildItemFact('boxxy.attempt.settled', {
    event,
    at: `2026-11-11T${time}.000Z`,
    payload,
  });
}

function buildMark(
  type: 'boxxy.attempt.slept' | 'boxxy.attempt.woken' | 'boxxy.attempt.closed_out',
  event: string,
  time: string,
  attempt: string,
): AppliedFact {
  return buildItemFact(type, {
    event,
    at: `2026-11-11T${time}.000Z`,
    payload: { attempt },
  });
}
