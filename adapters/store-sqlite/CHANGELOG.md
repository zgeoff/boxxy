# Changelog

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.2.3...@boxxy/store-sqlite@0.2.4) (2026-11-13)


### Features

* **dispatch:** file, list and release held items ([8b43b30](https://github.com/zgeoff/boxxy/commit/8b43b305c89d1f3dcced47779634441830f3f3fd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/content-hash bumped to 0.2.4
    * @boxxy/model bumped to 0.2.4
  * devDependencies
    * @boxxy/dispatch bumped to 0.2.4
  * peerDependencies
    * @boxxy/dispatch bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.2.2...@boxxy/store-sqlite@0.2.3) (2026-11-12)

### Features

- **dispatch:** run job attempts in the tick
  ([dbb6b5c](https://github.com/zgeoff/boxxy/commit/dbb6b5c63844557723fa82ffbf3762c1415dc1e9))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.3
    - @boxxy/model bumped to 0.2.3
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.3
  - peerDependencies
    - @boxxy/dispatch bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.2.1...@boxxy/store-sqlite@0.2.2) (2026-11-12)

### Bug Fixes

- **model:** read review close-outs stored before the review gate
  ([41f9de3](https://github.com/zgeoff/boxxy/commit/41f9de311c52fc915dfba989156d0277fef0707c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.2
    - @boxxy/model bumped to 0.2.2
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.2
  - peerDependencies
    - @boxxy/dispatch bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.2.0...@boxxy/store-sqlite@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.1
    - @boxxy/model bumped to 0.2.1
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.1
  - peerDependencies
    - @boxxy/dispatch bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.9...@boxxy/store-sqlite@0.2.0) (2026-11-12)

### Features

- **notices:** retry notices with backoff and keep each key on its row
  ([#89](https://github.com/zgeoff/boxxy/issues/89))
  ([b172a2b](https://github.com/zgeoff/boxxy/commit/b172a2bc47610f1a3ddf246a9123db6898358f07))

### Bug Fixes

- **dispatch:** read only sendable notices so used-up ones block none
  ([c79b3b3](https://github.com/zgeoff/boxxy/commit/c79b3b3f6ad5d5b6f576dced6189d7b31a1619f9))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.0
    - @boxxy/model bumped to 0.2.0
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.0
  - peerDependencies
    - @boxxy/dispatch bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.8...@boxxy/store-sqlite@0.1.9) (2026-11-12)

### Bug Fixes

- **store-sqlite:** reject an exclusive call once the store closes
  ([ac87f1d](https://github.com/zgeoff/boxxy/commit/ac87f1d6105fea1e2ceff1a17df199b9571432d4))
- **store-sqlite:** skip attempts with no session when matching a caller
  ([903fdd8](https://github.com/zgeoff/boxxy/commit/903fdd82fc270637fc993ff8478c9002103971ee))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.9
    - @boxxy/model bumped to 0.1.9
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.9
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.7...@boxxy/store-sqlite@0.1.8) (2026-11-12)

### Bug Fixes

- **store-sqlite:** keep sqlite temp files in memory
  ([90700b8](https://github.com/zgeoff/boxxy/commit/90700b875e08eee115cc3619a3649018c1a3a9a3))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.8
    - @boxxy/model bumped to 0.1.8
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.8
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.6...@boxxy/store-sqlite@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/store-sqlite:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.7
    - @boxxy/model bumped to 0.1.7
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.7
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.5...@boxxy/store-sqlite@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/store-sqlite:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.6
    - @boxxy/model bumped to 0.1.6
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.6
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.4...@boxxy/store-sqlite@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/store-sqlite:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.5
    - @boxxy/model bumped to 0.1.5
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.5
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.3...@boxxy/store-sqlite@0.1.4) (2026-11-12)

### Bug Fixes

- **release:** list test-util imports as peers and check imports
  ([f9e64a2](https://github.com/zgeoff/boxxy/commit/f9e64a2b787341b1ea994018205b01799f1fed38))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.4
    - @boxxy/model bumped to 0.1.4
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.4
  - peerDependencies
    - @boxxy/dispatch bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.1...@boxxy/store-sqlite@0.1.3) (2026-11-11)

### Features

- **dispatch:** cap the usage-limit backoff and add the claim benchmark
  ([91ada6a](https://github.com/zgeoff/boxxy/commit/91ada6af7b22f5c047d28e261435ab9c492c8502))
- **forge-github:** add the github forge and the pull request watch
  ([a0361e5](https://github.com/zgeoff/boxxy/commit/a0361e51550ebc1d5e0a11dc5dcd33f17c97ccc6))
- **model:** add the v1 rows, ports, close-outs, facts and reports
  ([ae3c02e](https://github.com/zgeoff/boxxy/commit/ae3c02e88e144578e6dbd76dd0b1c6e080cc0259))
- **store:** derive item positions and v1 states in the store reads
  ([c287b21](https://github.com/zgeoff/boxxy/commit/c287b2134aad953e1c9f32ce0bb8fb149eee204e))
- **store:** move the store to v1 rows, limit seats and outbox reads
  ([70cdd17](https://github.com/zgeoff/boxxy/commit/70cdd17389d0107d761f0af5fe412552c28a957c))

### Bug Fixes

- **store-sqlite:** close the gaps a review found after the store merged
  ([#43](https://github.com/zgeoff/boxxy/issues/43))
  ([90d9346](https://github.com/zgeoff/boxxy/commit/90d9346b4a44f56dafc0fd754091fc94d2ae618a))
- **store:** keep a closed-out sleeper seatless and fold every retry
  ([2e2b13e](https://github.com/zgeoff/boxxy/commit/2e2b13e174cda416279d0974ab372e0b38b7e41a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.3
    - @boxxy/model bumped to 0.1.3
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.3

## [0.1.1](https://github.com/zgeoff/boxxy/compare/@boxxy/store-sqlite@0.1.0...@boxxy/store-sqlite@0.1.1) (2026-11-08)

### Features

- **store-sqlite:** build the sqlite store behind the claim store port
  ([#40](https://github.com/zgeoff/boxxy/issues/40))
  ([98aac3a](https://github.com/zgeoff/boxxy/commit/98aac3aa5ed5a30ae09080f401f9e93f245230bb))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.2
  - devDependencies
    - @boxxy/dispatch bumped to 0.1.1

## 0.1.0 (2026-11-05)

### Bug Fixes

- say that each package installs from npm ([#5](https://github.com/zgeoff/boxxy/issues/5))
  ([f17e773](https://github.com/zgeoff/boxxy/commit/f17e773d33fe5d95db89a9bcf4aaa471abeeabaa))
