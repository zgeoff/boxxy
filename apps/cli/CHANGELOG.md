# Changelog

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
