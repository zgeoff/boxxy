# Changelog

## [0.2.7](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.6...@boxxy/contract@0.2.7) (2026-11-13)

### Features

- **auth:** move the mcp oauth server to @zgeoff/mcp-auth
  ([#103](https://github.com/zgeoff/boxxy/issues/103))
  ([889da8e](https://github.com/zgeoff/boxxy/commit/889da8ec9bfceeb239e225c255d244054d2a9bda))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.7

## [0.2.6](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.5...@boxxy/contract@0.2.6) (2026-11-13)

### Features

- **server:** let the notice session register itself
  ([97140bc](https://github.com/zgeoff/boxxy/commit/97140bc254b2c34adf5ebda91799991aa4cffcd1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.6

## [0.2.5](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.4...@boxxy/contract@0.2.5) (2026-11-13)

### Features

- **api:** let a session list and read the items of its repo
  ([c1ff07c](https://github.com/zgeoff/boxxy/commit/c1ff07c940a9b3554e454c973c246cf671b093ec))
- **closeout:** add needs-owner and split triage outcomes
  ([046b848](https://github.com/zgeoff/boxxy/commit/046b8481e76b26278eddf56fd138a5dbcb83b05e))
- **server:** let the owner set and clear the security mark
  ([baa4439](https://github.com/zgeoff/boxxy/commit/baa4439a5d98eea4b177bf7e3d9b33db153627e8))

### Bug Fixes

- **api:** hide kept sessions and hidden relations from session reads
  ([0c141ce](https://github.com/zgeoff/boxxy/commit/0c141ce62d9920318996444f0c08f8749799bd77))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.5

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.3...@boxxy/contract@0.2.4) (2026-11-13)

### Features

- **dispatch:** file, list and release held items
  ([8b43b30](https://github.com/zgeoff/boxxy/commit/8b43b305c89d1f3dcced47779634441830f3f3fd))

### Bug Fixes

- **dispatch:** refuse a retry of a held item so release starts at triage
  ([6e00400](https://github.com/zgeoff/boxxy/commit/6e0040069efcebbb958f4dbb248b423302bdc506))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.2...@boxxy/contract@0.2.3) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.1...@boxxy/contract@0.2.2) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.2.0...@boxxy/contract@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **server:** serve the owner mcp tools on a public oauth door
  ([#91](https://github.com/zgeoff/boxxy/issues/91))
  ([ebacd1c](https://github.com/zgeoff/boxxy/commit/ebacd1c1f7d86567326a405ce273992faed3f046))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.9...@boxxy/contract@0.2.0) (2026-11-12)

### Features

- **notices:** retry notices with backoff and keep each key on its row
  ([#89](https://github.com/zgeoff/boxxy/issues/89))
  ([b172a2b](https://github.com/zgeoff/boxxy/commit/b172a2bc47610f1a3ddf246a9123db6898358f07))
- **server:** refuse an item for a repo the configuration does not name
  ([e41d6f9](https://github.com/zgeoff/boxxy/commit/e41d6f9e8c10177d1d7bf5503d8a8003bac24bd2))

### Bug Fixes

- **contract:** drop the held bind answer that no server sends
  ([9dff204](https://github.com/zgeoff/boxxy/commit/9dff204ea202f6338ddd2f1b521693fa7ce2de76))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.8...@boxxy/contract@0.1.9) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.7...@boxxy/contract@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.6...@boxxy/contract@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.5...@boxxy/contract@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.4...@boxxy/contract@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/contract@0.1.3...@boxxy/contract@0.1.4) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/contract:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.4

## 0.1.3 (2026-11-11)

### Features

- **contract:** add the contract package with its 26 procedures
  ([3000858](https://github.com/zgeoff/boxxy/commit/300085809f9abbd466abd1499a39f746b1da9a12))
- **contract:** export the typed client
  ([a304a7b](https://github.com/zgeoff/boxxy/commit/a304a7b94b8dcf1dc297a92cfc5872f0324874b2))
- **contract:** refuse a pull request link that another item holds
  ([9075ebd](https://github.com/zgeoff/boxxy/commit/9075ebda24307a088066e730e91b85d7a1403cc0))
- **dispatch:** add the outbox sender step, fake sink and sink suite
  ([47aa88a](https://github.com/zgeoff/boxxy/commit/47aa88a0f9388ddc4751581ceb0416845141e1c3))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.3
