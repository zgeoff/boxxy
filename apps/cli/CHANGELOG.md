# Changelog

## [0.2.9](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.8...@boxxy/cli@0.2.9) (2026-11-14)


### Features

* **verify:** move to wringer 0.3 and add four journeys ([#117](https://github.com/zgeoff/boxxy/issues/117)) ([274d32b](https://github.com/zgeoff/boxxy/commit/274d32b7a8a72dd4f6680620deba0e91edcc1d65))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/contract bumped to 0.2.9
    * @boxxy/model bumped to 0.2.9
  * devDependencies
    * @boxxy/dispatch bumped to 0.2.9
    * @boxxy/rules bumped to 0.2.9
    * @boxxy/server bumped to 0.2.9
    * @boxxy/store-sqlite bumped to 0.2.9

## [0.2.8](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.7...@boxxy/cli@0.2.8) (2026-11-13)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.8
    - @boxxy/model bumped to 0.2.8
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.8
    - @boxxy/rules bumped to 0.2.8
    - @boxxy/server bumped to 0.2.8
    - @boxxy/store-sqlite bumped to 0.2.8

## [0.2.7](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.6...@boxxy/cli@0.2.7) (2026-11-13)

### Features

- **auth:** move the mcp oauth server to @zgeoff/mcp-auth
  ([#103](https://github.com/zgeoff/boxxy/issues/103))
  ([889da8e](https://github.com/zgeoff/boxxy/commit/889da8ec9bfceeb239e225c255d244054d2a9bda))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.7
    - @boxxy/model bumped to 0.2.7
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.7
    - @boxxy/rules bumped to 0.2.7
    - @boxxy/server bumped to 0.2.7
    - @boxxy/store-sqlite bumped to 0.2.7

## [0.2.6](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.5...@boxxy/cli@0.2.6) (2026-11-13)

### Features

- **cli:** name the evidence kind of a long log in the session guide
  ([ef764d7](https://github.com/zgeoff/boxxy/commit/ef764d7a3b408ba35b8ce333c512a16031d9a43d))
- **server:** let the notice session register itself
  ([97140bc](https://github.com/zgeoff/boxxy/commit/97140bc254b2c34adf5ebda91799991aa4cffcd1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.6
    - @boxxy/model bumped to 0.2.6
  - devDependencies
    - @boxxy/dispatch bumped to 0.2.6
    - @boxxy/rules bumped to 0.2.6
    - @boxxy/server bumped to 0.2.6
    - @boxxy/store-sqlite bumped to 0.2.6

## [0.2.5](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.4...@boxxy/cli@0.2.5) (2026-11-13)

### Features

- **api:** let a session list and read the items of its repo
  ([c1ff07c](https://github.com/zgeoff/boxxy/commit/c1ff07c940a9b3554e454c973c246cf671b093ec))
- **cli:** name the item reads in the session guide and verify them
  ([3803e8b](https://github.com/zgeoff/boxxy/commit/3803e8b2c185509f5fd9c475d08ea681725598c8))
- **cli:** tell a session where its input is and how to cite evidence
  ([286934c](https://github.com/zgeoff/boxxy/commit/286934cafdee2b7344b75a8e5eca9e503f34410d))
- **server:** let the owner set and clear the security mark
  ([baa4439](https://github.com/zgeoff/boxxy/commit/baa4439a5d98eea4b177bf7e3d9b33db153627e8))

### Bug Fixes

- **cli:** keep the server-starting test helpers out of the tarball
  ([bcbf3ad](https://github.com/zgeoff/boxxy/commit/bcbf3ade494eb11ab513c57c45221310b40f57e2))

### Reverts

- restore the system-tests package
  ([3fa7e41](https://github.com/zgeoff/boxxy/commit/3fa7e41906f18190c0a813dce547ce66908194ab))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.5
    - @boxxy/model bumped to 0.2.5

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.3...@boxxy/cli@0.2.4) (2026-11-13)

### Features

- **dispatch:** file, list and release held items
  ([8b43b30](https://github.com/zgeoff/boxxy/commit/8b43b305c89d1f3dcced47779634441830f3f3fd))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.4
    - @boxxy/model bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.2...@boxxy/cli@0.2.3) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.3
    - @boxxy/model bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.1...@boxxy/cli@0.2.2) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.2
    - @boxxy/model bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.2.0...@boxxy/cli@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **server:** serve the owner mcp tools on a public oauth door
  ([#91](https://github.com/zgeoff/boxxy/issues/91))
  ([ebacd1c](https://github.com/zgeoff/boxxy/commit/ebacd1c1f7d86567326a405ce273992faed3f046))
- **system-tests:** add the verify harness and three journeys
  ([#93](https://github.com/zgeoff/boxxy/issues/93))
  ([732cc7f](https://github.com/zgeoff/boxxy/commit/732cc7f7b920bc5bd09f86d7d2e353302734ee30))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.1
    - @boxxy/model bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.9...@boxxy/cli@0.2.0) (2026-11-12)

### Bug Fixes

- **cli:** check the skills folder just before each skill's copy
  ([b3364ec](https://github.com/zgeoff/boxxy/commit/b3364ec892da80c115e35e6469e560a24299b411))
- **cli:** keep the skills git from inheriting repository variables
  ([5d19e23](https://github.com/zgeoff/boxxy/commit/5d19e23216371126f1dcbdc544388ea5b4cf55e1))
- **cli:** read a help word that is a flag value as the value
  ([0e3af21](https://github.com/zgeoff/boxxy/commit/0e3af211b46c5ae6fc8f7b0db32a2d35f78d08f2))
- **cli:** refuse to install skills through a linked skills folder
  ([61efe00](https://github.com/zgeoff/boxxy/commit/61efe001d46a5733a56cddf9136a2b2a5da2f38c))
- **cli:** report a skill as missing when its copy fails
  ([b00ea48](https://github.com/zgeoff/boxxy/commit/b00ea481479d6a3949ad0ff268b8b7299d1f75c8))
- **cli:** tell a worker session how to close out
  ([7d397e2](https://github.com/zgeoff/boxxy/commit/7d397e2919e652d825e40f83cebb4ac55e0716b0))
- **contract:** drop the held bind answer that no server sends
  ([9dff204](https://github.com/zgeoff/boxxy/commit/9dff204ea202f6338ddd2f1b521693fa7ce2de76))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.2.0
    - @boxxy/model bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.8...@boxxy/cli@0.1.9) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.9
    - @boxxy/model bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.7...@boxxy/cli@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.8
    - @boxxy/model bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.6...@boxxy/cli@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.7
    - @boxxy/model bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.5...@boxxy/cli@0.1.6) (2026-11-12)

### Features

- **cli:** attach a compiled binary and the plug-in to each cli release
  ([681ac25](https://github.com/zgeoff/boxxy/commit/681ac25de671704c68171e3c0d5b9b140689d7ce))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.6
    - @boxxy/model bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.4...@boxxy/cli@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/cli:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.5
    - @boxxy/model bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.3...@boxxy/cli@0.1.4) (2026-11-12)

### Bug Fixes

- **pepys:** ship test-utils and check each export has a packed file
  ([b68d4b3](https://github.com/zgeoff/boxxy/commit/b68d4b3b15c05dabdf6406217a9874de37d46ebc))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.4
    - @boxxy/model bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/cli@0.1.0...@boxxy/cli@0.1.3) (2026-11-11)

### Features

- **cli:** add the boxxy commands and the two hooks
  ([098a1e8](https://github.com/zgeoff/boxxy/commit/098a1e809d8aaa193062767eaa85e4e07352df71))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/contract bumped to 0.1.3
    - @boxxy/model bumped to 0.1.3

## 0.1.0 (2026-11-05)

### Bug Fixes

- say that each package installs from npm ([#5](https://github.com/zgeoff/boxxy/issues/5))
  ([f17e773](https://github.com/zgeoff/boxxy/commit/f17e773d33fe5d95db89a9bcf4aaa471abeeabaa))
