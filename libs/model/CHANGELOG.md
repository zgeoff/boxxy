# Changelog

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/model@0.1.4...@boxxy/model@0.1.5) (2026-11-12)


### Miscellaneous Chores

* **@boxxy/model:** Synchronize boxxy versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/content-hash bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/model@0.1.3...@boxxy/model@0.1.4) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/model:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/model@0.1.2...@boxxy/model@0.1.3) (2026-11-11)

### Features

- **closeout:** add the four v1 phase kinds and the close-out limits
  ([e2a676c](https://github.com/zgeoff/boxxy/commit/e2a676c44ddbba3b574679c77106c7733a71ef68))
- **contract:** add the contract package with its 26 procedures
  ([3000858](https://github.com/zgeoff/boxxy/commit/300085809f9abbd466abd1499a39f746b1da9a12))
- **dispatch:** add the outbox sender step, fake sink and sink suite
  ([47aa88a](https://github.com/zgeoff/boxxy/commit/47aa88a0f9388ddc4751581ceb0416845141e1c3))
- **dispatch:** add the usage-limit close and the fake worker
  ([60016a0](https://github.com/zgeoff/boxxy/commit/60016a03faa11de2a10475a1ff602528df220ac1))
- **dispatch:** export the dispatch actions and drop the reconcile types
  ([dbce0f5](https://github.com/zgeoff/boxxy/commit/dbce0f50fe3d5b8280bb9f9884d6067edf6c7dc6))
- **dispatch:** keep rework sessions, forget sessions, send notices
  ([fe1133d](https://github.com/zgeoff/boxxy/commit/fe1133d8af6357a247282dff72d0b7e13d97a5d8))
- **forge-github:** add the github forge and the pull request watch
  ([a0361e5](https://github.com/zgeoff/boxxy/commit/a0361e51550ebc1d5e0a11dc5dcd33f17c97ccc6))
- **model:** add the caller proof port and the settled and retry helpers
  ([07cfeee](https://github.com/zgeoff/boxxy/commit/07cfeee20d07bd76d3290629bce744abf1a4440f))
- **model:** add the pipeline engine, v1 item state and rules dry run
  ([19b8013](https://github.com/zgeoff/boxxy/commit/19b80135241210e031c1b6631dd4b87f8c610396))
- **model:** add the v1 rows, ports, close-outs, facts and reports
  ([ae3c02e](https://github.com/zgeoff/boxxy/commit/ae3c02e88e144578e6dbd76dd0b1c6e080cc0259))
- **pepys:** add the pepys package: sink, reader, fold and queries
  ([1a01080](https://github.com/zgeoff/boxxy/commit/1a010804302be6ef243ea4a31773a001a0e4b9b4))
- **planning:** decide with limit seats, wakes first and pool backoff
  ([ee8f1a2](https://github.com/zgeoff/boxxy/commit/ee8f1a2e73d317b98c49c08536ba7b49420bb1b8))
- **rules:** load v1 pipelines, limits, pools, sleep and skills pin
  ([63d3d54](https://github.com/zgeoff/boxxy/commit/63d3d5447d81ddc0ac4b5b8684ee0a6b7a63c8bc))
- **store:** derive item positions and v1 states in the store reads
  ([c287b21](https://github.com/zgeoff/boxxy/commit/c287b2134aad953e1c9f32ce0bb8fb149eee204e))
- **store:** move the store to v1 rows, limit seats and outbox reads
  ([70cdd17](https://github.com/zgeoff/boxxy/commit/70cdd17389d0107d761f0af5fe412552c28a957c))

### Bug Fixes

- **dispatch:** hold the pool for 24 hours when the reset time is unknown
  ([e6decc9](https://github.com/zgeoff/boxxy/commit/e6decc947a7cbe73ff56fec1f8e8e2bb5bf92939))
- **store:** keep a closed-out sleeper seatless and fold every retry
  ([2e2b13e](https://github.com/zgeoff/boxxy/commit/2e2b13e174cda416279d0974ab372e0b38b7e41a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.3

## [0.1.2](https://github.com/zgeoff/boxxy/compare/@boxxy/model@0.1.1...@boxxy/model@0.1.2) (2026-11-08)

### Features

- **closeout:** parse the build close-out and dedupe its open items
  ([#42](https://github.com/zgeoff/boxxy/issues/42))
  ([d81fdfd](https://github.com/zgeoff/boxxy/commit/d81fdfd8dc2afded805e25268e0383fe6ee8b194))
- **planning:** build the frame and decide the next picks
  ([#48](https://github.com/zgeoff/boxxy/issues/48))
  ([5de3836](https://github.com/zgeoff/boxxy/commit/5de38366865fdc68a699d1c65afb89d600e8800d))
- **store-sqlite:** build the sqlite store behind the claim store port
  ([#40](https://github.com/zgeoff/boxxy/issues/40))
  ([98aac3a](https://github.com/zgeoff/boxxy/commit/98aac3aa5ed5a30ae09080f401f9e93f245230bb))

## [0.1.1](https://github.com/zgeoff/boxxy/compare/@boxxy/model@0.1.0...@boxxy/model@0.1.1) (2026-11-07)

### Features

- build the model, content hash and fact catalog libs
  ([#21](https://github.com/zgeoff/boxxy/issues/21))
  ([1428193](https://github.com/zgeoff/boxxy/commit/1428193def3e5cd0ef2a00e61c21d4b3faf0ca51))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.0

## 0.1.0 (2026-11-05)

### Bug Fixes

- say that each package installs from npm ([#5](https://github.com/zgeoff/boxxy/issues/5))
  ([f17e773](https://github.com/zgeoff/boxxy/commit/f17e773d33fe5d95db89a9bcf4aaa471abeeabaa))
