# Changelog

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/dispatch@0.1.5...@boxxy/dispatch@0.1.6) (2026-11-12)


### Miscellaneous Chores

* **@boxxy/dispatch:** Synchronize boxxy versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/closeout bumped to 0.1.6
    * @boxxy/content-hash bumped to 0.1.6
    * @boxxy/model bumped to 0.1.6
    * @boxxy/planning bumped to 0.1.6
  * devDependencies
    * @boxxy/rules bumped to 0.1.6
  * peerDependencies
    * @boxxy/rules bumped to 0.1.6

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
