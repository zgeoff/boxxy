# 0018: A public door for the owner's MCP endpoint

Date: 2026-11-13

## Decision

The server serves the owner's MCP tools on a third listener, the public door, behind OAuth. The OAuth server is a copy of the one in atc's `@atc/mcp`, in the package `@boxxy/auth-oauth`. A later shared package replaces the copy. The private owner listener stays as [0017](./0017-v1-scope.md) left it: no token, and the private network is its only gate. [API and auth](../design/boxxy/v1-api-and-auth.md#the-public-door) describes the door.

- The door serves `/mcp`, the OAuth routes and the sign-in pages, and never `/rpc` or `/healthz`. It sits on a port of its own, which the configuration sets, and is off when the configuration has no `publicDoor` section.
- A client is a public client that the owner adds with `boxxy auth clients add`. The door has no dynamic client registration. Each authorization needs a fresh passkey sign-in, then a consent page where only `read` starts ticked.
- A token holds `read`, `write` or both. `read` covers every tool that changes nothing, and `write` covers every tool that changes state. A tool with no scope in the access table is not served.
- The owner manages passkey enrollment, clients and grants with `boxxy auth` commands, which call procedures on the private owner listener. The public door never serves those procedures.
- The OAuth state lives in an auth database beside the store file, readable by its owner only.

## Rejected alternatives

| Option                                | Why not                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| a private relay in front of the owner listener | the owner cancelled it; the door needs no relay and no port-forward                                                                |
| impz's approve-a-code sign-in         | it approves a code with an owner token, and boxxy has no owner token to approve with |

## Why

The owner's assistant runs in a hosted service and has to reach boxxy from anywhere. The private owner listener is reachable only from the owner's network, and a token for a public endpoint needs an authorization server that proves the owner approved each client. atc already runs one that fits a single owner, so boxxy copies it with its own scopes and keeps the private listener and its rules unchanged.
