# Changelog

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
