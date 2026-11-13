# Changelog

## [0.2.5](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.2.4...@boxxy/dispatch@0.2.5) (2026-11-13)

### Features

- **api:** let a session list and read the items of its repo
  ([c1ff07c](https://github.com/zgeoff/boxxy/commit/c1ff07c940a9b3554e454c973c246cf671b093ec))
- **closeout:** add needs-owner and split triage outcomes
  ([046b848](https://github.com/zgeoff/boxxy/commit/046b8481e76b26278eddf56fd138a5dbcb83b05e))
- **closeout:** carry a blocked build or triage question into the retry
  ([616a9eb](https://github.com/zgeoff/boxxy/commit/616a9eb946dcf5455c20f8d3abcceafeb657149a))
- **closeout:** let a design carry a conclusion for the next build
  ([c0cd27d](https://github.com/zgeoff/boxxy/commit/c0cd27de061efad0d152024c01286f8d6f5d0961))
- **closeout:** let a design close-out set acceptance and file items
  ([1fae644](https://github.com/zgeoff/boxxy/commit/1fae64432325058409d68831ed625ddd16646764))
- **closeout:** let a triage close-out set the item body
  ([9eb8f5b](https://github.com/zgeoff/boxxy/commit/9eb8f5b5f7dd3bb7172a2e4a6d31ff83b03100e9))
- **closeout:** let a triage relation make the item wait on another
  ([e977518](https://github.com/zgeoff/boxxy/commit/e977518c2fa41e52d8f3365cf8236601a732416d))
- **closeout:** let an open item name its kind and the security mark
  ([63a2df4](https://github.com/zgeoff/boxxy/commit/63a2df4d995057017eb12a272f47d480cf395919))
- **closeout:** start a design on an item with no acceptance list
  ([5944fcc](https://github.com/zgeoff/boxxy/commit/5944fccbb8a1570661781bfa22fba28f94380495))
- **dispatch:** carry a blocked design's reason into the next design
  ([f1c2293](https://github.com/zgeoff/boxxy/commit/f1c229379b74366f15fdd0a188ff6616dbf4413d))
- **dispatch:** let design and build close-outs record a wait on an item
  ([f07d757](https://github.com/zgeoff/boxxy/commit/f07d7579ae4b8574895ffede061942a84f2422fd))
- **forge:** read a pull request's base branch
  ([33e8cc7](https://github.com/zgeoff/boxxy/commit/33e8cc7cda8c40ad248fb672b5affa2e98dde702))
- **forge:** read required checks and merge a pull request at its head
  ([40a38dd](https://github.com/zgeoff/boxxy/commit/40a38dd71e5ad1ab9f3b8915084067fe95f944a4))
- **rules:** let a recipe give a rework round its own prompt
  ([bf0e63c](https://github.com/zgeoff/boxxy/commit/bf0e63c12d471e201b829bfdc6db782103de1ead))
- **train:** merge a reviewed, green, verified pull request at its head
  ([3f09760](https://github.com/zgeoff/boxxy/commit/3f09760bad1cb9d409dd2930a5dacdb7679f11d8))

### Bug Fixes

- **dispatch:** compare-and-set a job's action mark on the row it read
  ([84b4bd2](https://github.com/zgeoff/boxxy/commit/84b4bd2aa5803acf015e88b00b9a8e0819b37091))
- **dispatch:** file a split part that has its parent's title
  ([55221c3](https://github.com/zgeoff/boxxy/commit/55221c3810d13adfd1390e90c11f0a47609192d7))
- **dispatch:** hand a kept agent session over at its first bind
  ([9d34a82](https://github.com/zgeoff/boxxy/commit/9d34a8211bad7cd97ae2aea6fa73e0763d35aece))
- **dispatch:** leave a merge with no merge commit to the watch
  ([6a6b035](https://github.com/zgeoff/boxxy/commit/6a6b035dd7d0a6189968b101bdfe23627605858a))
- **dispatch:** let only a live attempt take over a kept agent session
  ([6df8bc7](https://github.com/zgeoff/boxxy/commit/6df8bc7431fe9967187962b03ec7902e5596c298))
- **dispatch:** refuse a job timeout on a row another runner moved
  ([98704b9](https://github.com/zgeoff/boxxy/commit/98704b99df31f61c2dd5459bac08b6d1b88fc79e))
- **dispatch:** skip a close-out relation whose reverse is live
  ([102db78](https://github.com/zgeoff/boxxy/commit/102db78c9e74f725bd7d7c095cd67d4990080f00))
- **dispatch:** time out a job attempt whose read throws past its limit
  ([06d8303](https://github.com/zgeoff/boxxy/commit/06d830391eb9596d3883779d3d4c4e202a09e364))
- **forge:** refuse a branch past the rules limit, read closed as unknown
  ([e64d471](https://github.com/zgeoff/boxxy/commit/e64d471f41e331a27e2981b889e1050f88c4c1ee))
- **train:** hold a merge that has no pull request or head to read
  ([635679a](https://github.com/zgeoff/boxxy/commit/635679adcf42020d8022f4c1b843c15e96b7d21d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.5
    - @boxxy/content-hash bumped to 0.2.5
    - @boxxy/model bumped to 0.2.5
    - @boxxy/planning bumped to 0.2.5
    - @boxxy/prompt-template bumped to 0.2.5
  - devDependencies
    - @boxxy/rules bumped to 0.2.5
  - peerDependencies
    - @boxxy/rules bumped to 0.2.5

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.2.3...@boxxy/dispatch@0.2.4) (2026-11-13)

### Features

- **closeout:** send a failed verify's features to the rework build
  ([c5222b0](https://github.com/zgeoff/boxxy/commit/c5222b0cecfc49b52198e2e9353f351e658f4908))
- **dispatch:** file, list and release held items
  ([8b43b30](https://github.com/zgeoff/boxxy/commit/8b43b305c89d1f3dcced47779634441830f3f3fd))
- **rules:** keep the read-only clone token to review sessions
  ([9bd4803](https://github.com/zgeoff/boxxy/commit/9bd4803e3e27cf641b8b2403dae4618e0458a592))
- **verifier:** read the verify gate and report at a head
  ([2097016](https://github.com/zgeoff/boxxy/commit/209701609ac965621fd22e3ee4ebb03b244b7b99))

### Bug Fixes

- **dispatch:** carry the fallback flag on a reconciled start
  ([e64b901](https://github.com/zgeoff/boxxy/commit/e64b901ef13eecf3e607bbdbf87fd06445930ea9))
- **dispatch:** keep the session bookkeeping on a reconciled wake
  ([7e30353](https://github.com/zgeoff/boxxy/commit/7e303535ebf49df45a80bd9784c5bb699aecfa9f))
- **verifier:** require the gate as a check run and page the statuses
  ([d124c96](https://github.com/zgeoff/boxxy/commit/d124c96bb819e85c7cbbce9fde89e23ebd2dd504))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.4
    - @boxxy/content-hash bumped to 0.2.4
    - @boxxy/model bumped to 0.2.4
    - @boxxy/planning bumped to 0.2.4
    - @boxxy/prompt-template bumped to 0.2.4
  - devDependencies
    - @boxxy/rules bumped to 0.2.4
  - peerDependencies
    - @boxxy/rules bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.2.2...@boxxy/dispatch@0.2.3) (2026-11-12)

### Features

- **closeout:** add the verify phase on the build's kept session
  ([94b58de](https://github.com/zgeoff/boxxy/commit/94b58de300eee536b3ad2a156fa668cfa221d751))
- **dispatch:** run job attempts in the tick
  ([dbb6b5c](https://github.com/zgeoff/boxxy/commit/dbb6b5c63844557723fa82ffbf3762c1415dc1e9))
- **rules:** render launch prompts with liquid
  ([3a2d195](https://github.com/zgeoff/boxxy/commit/3a2d19545b9eecee94086364986f9cfa7601b642))

### Bug Fixes

- **dispatch:** read a respawned verify's grader from its stored input
  ([353c183](https://github.com/zgeoff/boxxy/commit/353c18378f5a7afa0ccc56be4152c6ece0031bc5))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.3
    - @boxxy/content-hash bumped to 0.2.3
    - @boxxy/model bumped to 0.2.3
    - @boxxy/planning bumped to 0.2.3
    - @boxxy/prompt-template bumped to 0.2.3
  - devDependencies
    - @boxxy/rules bumped to 0.2.3
  - peerDependencies
    - @boxxy/rules bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.2.1...@boxxy/dispatch@0.2.2) (2026-11-12)

### Features

- **review:** add the review phase on the noslop review gate
  ([303381e](https://github.com/zgeoff/boxxy/commit/303381ec2850ee40231148e0ee7931a49a30e9c3))

### Bug Fixes

- **dispatch:** reject a review close-out on a server with no review gate
  ([f3a874b](https://github.com/zgeoff/boxxy/commit/f3a874b3d790239a5737b2146f9414d9eae878f7))
- **model:** read review close-outs stored before the review gate
  ([41f9de3](https://github.com/zgeoff/boxxy/commit/41f9de311c52fc915dfba989156d0277fef0707c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.2
    - @boxxy/content-hash bumped to 0.2.2
    - @boxxy/model bumped to 0.2.2
    - @boxxy/planning bumped to 0.2.2
  - devDependencies
    - @boxxy/rules bumped to 0.2.2
  - peerDependencies
    - @boxxy/rules bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.2.0...@boxxy/dispatch@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **model:** add the review, verify and merge ports and loader checks
  ([dd3a810](https://github.com/zgeoff/boxxy/commit/dd3a810e811a49abb235cc38dbf78857491c82a1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.1
    - @boxxy/content-hash bumped to 0.2.1
    - @boxxy/model bumped to 0.2.1
    - @boxxy/planning bumped to 0.2.1
  - devDependencies
    - @boxxy/rules bumped to 0.2.1
  - peerDependencies
    - @boxxy/rules bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.9...@boxxy/dispatch@0.2.0) (2026-11-12)

### Features

- **notices:** retry notices with backoff and keep each key on its row
  ([#89](https://github.com/zgeoff/boxxy/issues/89))
  ([b172a2b](https://github.com/zgeoff/boxxy/commit/b172a2bc47610f1a3ddf246a9123db6898358f07))

### Bug Fixes

- **dispatch:** key a pull request link by the item's repo spelling
  ([a870ac6](https://github.com/zgeoff/boxxy/commit/a870ac6086a847be0bead4de6e39e4ed7aac67e2))
- **dispatch:** read only sendable notices so used-up ones block none
  ([c79b3b3](https://github.com/zgeoff/boxxy/commit/c79b3b3f6ad5d5b6f576dced6189d7b31a1619f9))
- **dispatch:** record the session of a late stray so cleanup forgets it
  ([4e48f0a](https://github.com/zgeoff/boxxy/commit/4e48f0a914aa08f134283cdc8d45258981b98510))
- **dispatch:** wake the kept session again after a lost wake reply
  ([2e2ddaf](https://github.com/zgeoff/boxxy/commit/2e2ddafa25b134a93d2d29f4b3c0eb5e83e5b0d5))
- **model:** rename the store version field of the decision fact
  ([8407926](https://github.com/zgeoff/boxxy/commit/8407926275355fc3a8bd8bb016a00786136609c1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.2.0
    - @boxxy/content-hash bumped to 0.2.0
    - @boxxy/model bumped to 0.2.0
    - @boxxy/planning bumped to 0.2.0
  - devDependencies
    - @boxxy/rules bumped to 0.2.0
  - peerDependencies
    - @boxxy/rules bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.8...@boxxy/dispatch@0.1.9) (2026-11-12)

### Features

- **server:** name the clone token variable of a git source
  ([bb0c0d1](https://github.com/zgeoff/boxxy/commit/bb0c0d1ecdac12235afc70d1911845053b3adf89))

### Bug Fixes

- **dispatch:** give no second claim of an item in one tick
  ([c4e2f27](https://github.com/zgeoff/boxxy/commit/c4e2f27d33d66882d27ecfae68105a018ea35963))
- **dispatch:** pass over an item of an unconfigured repo in the claim
  ([f64dcdc](https://github.com/zgeoff/boxxy/commit/f64dcdc27989bc3aeab6cb3321f07e7409a95ff4))
- **server:** log the reason of a refused spawn
  ([5969fea](https://github.com/zgeoff/boxxy/commit/5969feaa9b6322bbefbba1e6dbe689dc5527bc18))
- **server:** log the reason of a refused wake and atc's problem
  ([1f6ef46](https://github.com/zgeoff/boxxy/commit/1f6ef468e5ad74cad84490e3f4eec587e70873e3))
- **store-sqlite:** reject an exclusive call once the store closes
  ([ac87f1d](https://github.com/zgeoff/boxxy/commit/ac87f1d6105fea1e2ceff1a17df199b9571432d4))
- **store-sqlite:** skip attempts with no session when matching a caller
  ([903fdd8](https://github.com/zgeoff/boxxy/commit/903fdd82fc270637fc993ff8478c9002103971ee))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.9
    - @boxxy/content-hash bumped to 0.1.9
    - @boxxy/model bumped to 0.1.9
    - @boxxy/planning bumped to 0.1.9
  - devDependencies
    - @boxxy/rules bumped to 0.1.9
  - peerDependencies
    - @boxxy/rules bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.7...@boxxy/dispatch@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/dispatch:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.8
    - @boxxy/content-hash bumped to 0.1.8
    - @boxxy/model bumped to 0.1.8
    - @boxxy/planning bumped to 0.1.8
  - devDependencies
    - @boxxy/rules bumped to 0.1.8
  - peerDependencies
    - @boxxy/rules bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.6...@boxxy/dispatch@0.1.7) (2026-11-12)

### Features

- **worker-atc:** spawn a git workspace on targets with fresh machines
  ([578228e](https://github.com/zgeoff/boxxy/commit/578228ec91ec9f17e81021226f27bc7c3f081f28))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.7
    - @boxxy/content-hash bumped to 0.1.7
    - @boxxy/model bumped to 0.1.7
    - @boxxy/planning bumped to 0.1.7
  - devDependencies
    - @boxxy/rules bumped to 0.1.7
  - peerDependencies
    - @boxxy/rules bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.5...@boxxy/dispatch@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/dispatch:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.6
    - @boxxy/content-hash bumped to 0.1.6
    - @boxxy/model bumped to 0.1.6
    - @boxxy/planning bumped to 0.1.6
  - devDependencies
    - @boxxy/rules bumped to 0.1.6
  - peerDependencies
    - @boxxy/rules bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.4...@boxxy/dispatch@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/dispatch:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.5
    - @boxxy/content-hash bumped to 0.1.5
    - @boxxy/model bumped to 0.1.5
    - @boxxy/planning bumped to 0.1.5
  - devDependencies
    - @boxxy/rules bumped to 0.1.5
  - peerDependencies
    - @boxxy/rules bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.3...@boxxy/dispatch@0.1.4) (2026-11-12)

### Bug Fixes

- **release:** list test-util imports as peers and check imports
  ([f9e64a2](https://github.com/zgeoff/boxxy/commit/f9e64a2b787341b1ea994018205b01799f1fed38))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.4
    - @boxxy/content-hash bumped to 0.1.4
    - @boxxy/model bumped to 0.1.4
    - @boxxy/planning bumped to 0.1.4
  - devDependencies
    - @boxxy/rules bumped to 0.1.4
  - peerDependencies
    - @boxxy/rules bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.1...@boxxy/dispatch@0.1.3) (2026-11-11)

### Features

- **dispatch:** add the attempt machine and its one change builder
  ([7b8d404](https://github.com/zgeoff/boxxy/commit/7b8d404495f95b4249ae693957187c2a505ef5e8))
- **dispatch:** add the claim, close-out, settle and reading actions
  ([10301fd](https://github.com/zgeoff/boxxy/commit/10301fd77e9720f497747778335a061b150bf846))
- **dispatch:** add the outbox sender step, fake sink and sink suite
  ([47aa88a](https://github.com/zgeoff/boxxy/commit/47aa88a0f9388ddc4751581ceb0416845141e1c3))
- **dispatch:** add the reconcile table
  ([768f912](https://github.com/zgeoff/boxxy/commit/768f91294f81aef79ac017a570350b65a9944bb7))
- **dispatch:** add the session bind and the stray session stop
  ([e93c65c](https://github.com/zgeoff/boxxy/commit/e93c65c7b46a90b8296a2e4ee460d19f81ebaf23))
- **dispatch:** add the usage-limit close and the fake worker
  ([60016a0](https://github.com/zgeoff/boxxy/commit/60016a03faa11de2a10475a1ff602528df220ac1))
- **dispatch:** cap the usage-limit backoff and add the claim benchmark
  ([91ada6a](https://github.com/zgeoff/boxxy/commit/91ada6af7b22f5c047d28e261435ab9c492c8502))
- **dispatch:** export the dispatch actions and drop the reconcile types
  ([dbce0f5](https://github.com/zgeoff/boxxy/commit/dbce0f50fe3d5b8280bb9f9884d6067edf6c7dc6))
- **dispatch:** keep rework sessions, forget sessions, send notices
  ([fe1133d](https://github.com/zgeoff/boxxy/commit/fe1133d8af6357a247282dff72d0b7e13d97a5d8))
- **forge-github:** add the github forge and the pull request watch
  ([a0361e5](https://github.com/zgeoff/boxxy/commit/a0361e51550ebc1d5e0a11dc5dcd33f17c97ccc6))
- **model:** add the v1 rows, ports, close-outs, facts and reports
  ([ae3c02e](https://github.com/zgeoff/boxxy/commit/ae3c02e88e144578e6dbd76dd0b1c6e080cc0259))
- **pepys:** add the pepys package: sink, reader, fold and queries
  ([1a01080](https://github.com/zgeoff/boxxy/commit/1a010804302be6ef243ea4a31773a001a0e4b9b4))
- **store:** derive item positions and v1 states in the store reads
  ([c287b21](https://github.com/zgeoff/boxxy/commit/c287b2134aad953e1c9f32ce0bb8fb149eee204e))
- **store:** move the store to v1 rows, limit seats and outbox reads
  ([70cdd17](https://github.com/zgeoff/boxxy/commit/70cdd17389d0107d761f0af5fe412552c28a957c))

### Bug Fixes

- **dispatch:** check the hook's pull request link again in its lock
  ([e0552be](https://github.com/zgeoff/boxxy/commit/e0552be52ce78f1ad3a42a9ae091c1f2c05639bb))
- **dispatch:** hold the pool for 24 hours when the reset time is unknown
  ([e6decc9](https://github.com/zgeoff/boxxy/commit/e6decc947a7cbe73ff56fec1f8e8e2bb5bf92939))
- **dispatch:** list a repeated open-item title as a skipped effect
  ([4b3b01c](https://github.com/zgeoff/boxxy/commit/4b3b01c14ff833fc8743a6d2c3a3a91736c4de68))
- **dispatch:** refuse a reading action whose attempt row moved on
  ([83cf84f](https://github.com/zgeoff/boxxy/commit/83cf84fda4166ca82505e6ea3ad4b6ae260dffae))
- **dispatch:** settle a close-out that repeats a relation or a close
  ([8a8af90](https://github.com/zgeoff/boxxy/commit/8a8af90b8eee28242ea33edb37b65b3f45ca7008))
- **store-sqlite:** close the gaps a review found after the store merged
  ([#43](https://github.com/zgeoff/boxxy/issues/43))
  ([90d9346](https://github.com/zgeoff/boxxy/commit/90d9346b4a44f56dafc0fd754091fc94d2ae618a))
- **store:** keep a closed-out sleeper seatless and fold every retry
  ([2e2b13e](https://github.com/zgeoff/boxxy/commit/2e2b13e174cda416279d0974ab372e0b38b7e41a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/closeout bumped to 0.1.3
    - @boxxy/content-hash bumped to 0.1.3
    - @boxxy/model bumped to 0.1.3
    - @boxxy/planning bumped to 0.1.3
  - devDependencies
    - @boxxy/rules bumped to 0.1.3

## [0.1.1](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.0...@boxxy/dispatch@0.1.1) (2026-11-08)

### Features

- **store-sqlite:** build the sqlite store behind the claim store port
  ([#40](https://github.com/zgeoff/boxxy/issues/40))
  ([98aac3a](https://github.com/zgeoff/boxxy/commit/98aac3aa5ed5a30ae09080f401f9e93f245230bb))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.2

## 0.1.0 (2026-11-05)

### Bug Fixes

- say that each package installs from npm ([#5](https://github.com/zgeoff/boxxy/issues/5))
  ([f17e773](https://github.com/zgeoff/boxxy/commit/f17e773d33fe5d95db89a9bcf4aaa471abeeabaa))
