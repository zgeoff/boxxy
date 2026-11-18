import type {
  ClaimStore,
  Forge,
  Instant,
  ItemRules,
  ItemShipped,
  NewId,
  RepoName,
  RunnerId,
  ShipRule,
} from '@boxxy/model';

export interface WatchShipsInput {
  readonly forge: Forge;
  readonly store: ClaimStore;
  readonly rules: ItemRules;
  readonly runner: RunnerId;
  readonly now: Instant;
  readonly newId: NewId;

  // the repos the server serves; the watch reads only an item of one of them
  readonly spawnRepos: ReadonlySet<RepoName>;

  // reports a repo that the App cannot read, and a forge call that threw
  readonly warn: (message: string, detail: Readonly<Record<string, string>>) => void;
}

// An item whose latest merge commit has no shipped row yet, with the rule of its repo.
export interface ShipCandidate {
  readonly itemId: ItemShipped['itemId'];
  readonly repo: RepoName;
  readonly commit: ItemShipped['commit'];
  readonly rule: Exclude<ShipRule, 'none'>;
}

// What the watch found for one candidate; the watch adds `seenAt`.
export type ShipFinding = Omit<ItemShipped, 'itemId' | 'commit' | 'seenAt'>;
