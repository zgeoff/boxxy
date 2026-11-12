# Changelog

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
