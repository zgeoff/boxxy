import type { NoticeSessionRow } from '@boxxy/model';
import { api } from './api.ts';

// The notice session's row, which the notifier reads on each try. Both procedures write no fact:
// the fact catalog has no notice session fact.
export const noticesHandlers = {
  register: api.notices.register.handler(async (options) => {
    const deps = options.context.deps;
    const session = { gatewayID: options.input.gatewayID, setAt: deps.clock.now() };

    await deps.store.exclusive((tx) => tx.writeNoticeSession(session));

    return { session: toWireSession(session) };
  }),
  show: api.notices.show.handler(async (options) => {
    const session = await options.context.deps.store.read((tx) => tx.readNoticeSession());

    return { session: session === null ? null : toWireSession(session) };
  }),
};

function toWireSession(session: NoticeSessionRow) {
  return { gatewayID: session.gatewayID, setAt: new Date(session.setAt).toISOString() };
}
