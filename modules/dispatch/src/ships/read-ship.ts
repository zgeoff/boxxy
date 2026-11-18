import type {
  CommitSha,
  Forge,
  Instant,
  MergedPullRequest,
  Release,
  RepoName,
  ShipRule,
} from '@boxxy/model';
import { collectNamedReleases } from './collect-named-releases.ts';
import type { ShipFinding } from './types.ts';

// The forge reads of one pass, each made once for a repo whatever the number of items. A call that
// threw stays thrown for the pass, so every item that needed it writes nothing.
export interface ShipReads {
  readonly readRepo: (repo: RepoName) => Promise<'readable' | 'not-found'>;
  readonly readTag: (repo: RepoName, tag: string) => Promise<CommitSha | null>;
  readonly listReleases: (repo: RepoName) => Promise<readonly Release[]>;
  readonly readBumps: (repo: RepoName, since: Instant) => Promise<readonly MergedPullRequest[]>;
  readonly contains: Forge['contains'];

  // told once for each repo that the App cannot read
  readonly onUnreadable: (repo: RepoName) => void;
}

interface ReadShipInput {
  readonly reads: ShipReads;
  readonly repo: RepoName;
  readonly commit: CommitSha;
  readonly rule: Exclude<ShipRule, 'none'>;
}

// Whether the merge commit shipped by the repo's rule, and how. null: not yet, or a repo that the
// App cannot read. A forge call that throws throws out of here.
export async function readShip(input: ReadShipInput): Promise<ShipFinding | null> {
  const readable = await input.reads.readRepo(input.repo);

  if (readable === 'not-found') {
    input.reads.onUnreadable(input.repo);

    return null;
  }

  const rule = input.rule;

  if ('deploy-tag' in rule) {
    const tag = rule['deploy-tag'].tag;

    const isShipped = await probeTagContains(input, input.repo, tag);

    return isShipped ? { rule: 'deploy-tag', ref: tag } : null;
  }

  const releases = await readContainingReleases(input, rule.release.prerelease === true);

  const oldest = releases.at(-1);

  if (oldest === undefined) {
    return null;
  }

  const deploy = rule.then;

  if (deploy === undefined) {
    return { rule: 'release', ref: oldest.tag };
  }

  const later = await readLaterReleases(input, oldest);

  return readDeploy(input, { target: deploy, releases: later, oldest });
}

// the tag's commit holds the merge commit; a missing tag holds nothing
async function probeTagContains(
  input: ReadShipInput,
  repo: RepoName,
  tag: string,
  commit: CommitSha = input.commit,
): Promise<boolean> {
  const tagged = await input.reads.readTag(repo, tag);

  if (tagged === null) {
    return false;
  }

  return input.reads.contains(repo, tagged, commit);
}

// Newest first, from the newest published release that holds the commit back to the oldest one
// that does. The read stops at the first release that lacks the commit.
async function readContainingReleases(
  input: ReadShipInput,
  allowPrerelease: boolean,
): Promise<Release[]> {
  const containing: Release[] = [];

  for (const release of await input.reads.listReleases(input.repo)) {
    if (release.draft || (release.prerelease && !allowPrerelease)) {
      continue;
    }

    const isContaining = await probeTagContains(input, input.repo, release.tag);

    if (!isContaining) {
      break;
    }

    containing.push(release);
  }

  return containing;
}

// Every published release from the oldest containing one on, prereleases included, oldest first.
async function readLaterReleases(input: ReadShipInput, oldest: Release): Promise<Release[]> {
  const published = await input.reads.listReleases(input.repo);

  return published
    .filter((release) => !release.draft && release.publishedAt >= oldest.publishedAt)
    .toReversed();
}

interface DeployInput {
  readonly target: { readonly repo: RepoName; readonly tag: string };
  readonly releases: readonly Release[];
  readonly oldest: Release;
}

// A bump counts when its body names the oldest containing release, or any release published after
// it. The item ships
// when the deploy tag holds a counted bump's merge commit.
async function readDeploy(input: ReadShipInput, deploy: DeployInput): Promise<ShipFinding | null> {
  const reads = input.reads;

  const readable = await reads.readRepo(deploy.target.repo);

  if (readable === 'not-found') {
    reads.onUnreadable(deploy.target.repo);

    return null;
  }

  const bumps = await reads.readBumps(deploy.target.repo, deploy.oldest.publishedAt);

  for (const bump of bumps) {
    const [named] = collectNamedReleases(bump.body, deploy.releases);

    if (named === undefined) {
      continue;
    }

    const isDeployed = await probeTagContains(
      input,
      deploy.target.repo,
      deploy.target.tag,
      bump.mergeCommit,
    );

    if (isDeployed) {
      return { rule: 'release-then-deploy', ref: deploy.target.tag, release: named.tag };
    }
  }

  return null;
}
