import { workFactSchemas } from '@boxxy/model';
import type { FactType } from '@boxxy/model';
import { z } from 'zod';

// The sink adds the store version to every payload, and no model schema holds it, so the wire
// schema of a type is the model's schema plus that one field. These are the `types` of the fact
// family.
const storeVersion = { storeVersion: z.number().int().positive() };

export const wireFactSchemas = {
  'boxxy.item.filed': workFactSchemas['boxxy.item.filed'].extend(storeVersion),
  'boxxy.item.noted': workFactSchemas['boxxy.item.noted'].extend(storeVersion),
  'boxxy.item.edited': workFactSchemas['boxxy.item.edited'].extend(storeVersion),
  'boxxy.item.closed': workFactSchemas['boxxy.item.closed'].extend(storeVersion),
  'boxxy.relation.added': workFactSchemas['boxxy.relation.added'].extend(storeVersion),
  'boxxy.relation.removed': workFactSchemas['boxxy.relation.removed'].extend(storeVersion),
  'boxxy.lever.recorded': workFactSchemas['boxxy.lever.recorded'].extend(storeVersion),
  'boxxy.attempt.claimed': workFactSchemas['boxxy.attempt.claimed'].extend(storeVersion),
  'boxxy.decision.recorded': workFactSchemas['boxxy.decision.recorded'].extend(storeVersion),
  'boxxy.attempt.started': workFactSchemas['boxxy.attempt.started'].extend(storeVersion),
  'boxxy.attempt.spawn_unanswered':
    workFactSchemas['boxxy.attempt.spawn_unanswered'].extend(storeVersion),
  'boxxy.attempt.reconciled': workFactSchemas['boxxy.attempt.reconciled'].extend(storeVersion),
  'boxxy.attempt.session_bound':
    workFactSchemas['boxxy.attempt.session_bound'].extend(storeVersion),
  'boxxy.attempt.slept': workFactSchemas['boxxy.attempt.slept'].extend(storeVersion),
  'boxxy.attempt.wake_requested':
    workFactSchemas['boxxy.attempt.wake_requested'].extend(storeVersion),
  'boxxy.attempt.woken': workFactSchemas['boxxy.attempt.woken'].extend(storeVersion),
  'boxxy.attempt.resumed': workFactSchemas['boxxy.attempt.resumed'].extend(storeVersion),
  'boxxy.attempt.closed_out': workFactSchemas['boxxy.attempt.closed_out'].extend(storeVersion),
  'boxxy.attempt.timed_out': workFactSchemas['boxxy.attempt.timed_out'].extend(storeVersion),
  'boxxy.attempt.turn_ended': workFactSchemas['boxxy.attempt.turn_ended'].extend(storeVersion),
  'boxxy.attempt.settled': workFactSchemas['boxxy.attempt.settled'].extend(storeVersion),
  'boxxy.proposal.recorded': workFactSchemas['boxxy.proposal.recorded'].extend(storeVersion),
  'boxxy.evidence.recorded': workFactSchemas['boxxy.evidence.recorded'].extend(storeVersion),
  'boxxy.pull_request.linked': workFactSchemas['boxxy.pull_request.linked'].extend(storeVersion),
  'boxxy.commit.linked': workFactSchemas['boxxy.commit.linked'].extend(storeVersion),
  'boxxy.pull_request.merged': workFactSchemas['boxxy.pull_request.merged'].extend(storeVersion),
  'boxxy.pull_request.closed': workFactSchemas['boxxy.pull_request.closed'].extend(storeVersion),
  'boxxy.attempt.job_started': workFactSchemas['boxxy.attempt.job_started'].extend(storeVersion),
  'boxxy.merge.requested': workFactSchemas['boxxy.merge.requested'].extend(storeVersion),
  'boxxy.merge.answered': workFactSchemas['boxxy.merge.answered'].extend(storeVersion),
} satisfies Readonly<Record<FactType, z.ZodObject>>;
