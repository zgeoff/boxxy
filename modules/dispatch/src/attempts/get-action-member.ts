import type { JobAction, MergeMember } from '@boxxy/model';
import invariant from 'tiny-invariant';

// The pull request a direct merge names: the one member of its unit.
export function getActionMember(action: JobAction): MergeMember {
  const [member] = action.unit.members;

  invariant(member !== undefined, 'a merge unit holds a pull request');

  return member;
}
