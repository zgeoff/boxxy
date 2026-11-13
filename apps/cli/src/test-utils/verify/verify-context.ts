import type { Endpoints, RepoExec } from '@wringer/core';
import type { HttpClient } from '@wringer/http';

// What an action or a read of the registry hands to the steps it runs: the repo's exec, the
// endpoints of the launched harness, and the http driver aimed at its control routes.
export interface VerifyContext {
  readonly exec: RepoExec;
  readonly endpoints: Endpoints;
  readonly drivers: { readonly http: HttpClient };
}
