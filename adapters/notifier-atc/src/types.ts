export interface AtcSendRequest {
  // the gateway ID of the session that gets the message
  readonly session: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

// The one call the adapter needs. It resolves when atc takes the message and rejects when atc
// refuses it or cannot be reached; a rejection may carry a string `code`, such as `no_such_session`.
export interface AtcMessageClient {
  sendMessage: (request: AtcSendRequest) => Promise<unknown>;
}

export interface AtcNotifierOptions {
  readonly client: AtcMessageClient;

  // The gateway ID of the session that gets the notices, read on each call, so a change of
  // session takes effect on the next notice. null: no session is set, and the call sends nothing.
  readonly readSession: () => Promise<string | null>;
}
