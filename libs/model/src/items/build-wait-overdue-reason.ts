// The reason of the notify notice for an item that waited too long: the wait kind and the hours
// the step allows, such as `wait-overdue:shipped:6`.
export function buildWaitOverdueReason(kind: string, hours: number): string {
  return `wait-overdue:${kind}:${hours}`;
}
