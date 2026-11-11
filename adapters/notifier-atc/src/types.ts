export interface AtcSendRequest {
  // the name or the id of the session that gets the message
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
  readonly session: string;
}
