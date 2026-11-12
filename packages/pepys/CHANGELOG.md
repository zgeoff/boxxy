# Changelog

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.9...@boxxy/pepys@0.2.0) (2026-11-12)

### ⚠ BREAKING CHANGES

- **pepys:** @boxxy/pepys now needs @pepys/* 0.2.x as its peers. A deployment on @pepys/* 0.1.x must
  move to 0.2.0 before it takes this release.

### Features

- **pepys:** move to pepys 0.2.0
  ([0b732f5](https://github.com/zgeoff/boxxy/commit/0b732f5417062c4e04c47b42882ebb3a18b240df))

### Bug Fixes

- **model:** rename the store version field of the decision fact
  ([8407926](https://github.com/zgeoff/boxxy/commit/8407926275355fc3a8bd8bb016a00786136609c1))
- **pepys:** bind the atc session by the id that telemetry carries
  ([#90](https://github.com/zgeoff/boxxy/issues/90))
  ([c9a79e3](https://github.com/zgeoff/boxxy/commit/c9a79e3fdca5e5704013fe7ad4c306e99b86bf26))
- **pepys:** count a turn cost as cover for its own session only
  ([d8748c9](https://github.com/zgeoff/boxxy/commit/d8748c91199c2afcd7e7fad7d3edfa241f8fd7ee))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.8...@boxxy/pepys@0.1.9) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/pepys:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.7...@boxxy/pepys@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/pepys:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.6...@boxxy/pepys@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/pepys:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.5...@boxxy/pepys@0.1.6) (2026-11-12)

### Features

- **pepys:** take the delivery module as the github plug-in exports it
  ([29fd472](https://github.com/zgeoff/boxxy/commit/29fd472b42690c4cf8a5f6829664bb25b25583bd))

### Bug Fixes

- **pepys:** move to pepys 0.1.1 and apply the fact log with pepys code
  ([fe0acb8](https://github.com/zgeoff/boxxy/commit/fe0acb833b49d155da784f94faf43073c942f8a2))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.4...@boxxy/pepys@0.1.5) (2026-11-12)

### Bug Fixes

- **pepys:** take the pepys packages from npm and test against them
  ([1c9a4a4](https://github.com/zgeoff/boxxy/commit/1c9a4a42cd7527fab4236b73d5b8ad7f89d5abad))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/pepys@0.1.3...@boxxy/pepys@0.1.4) (2026-11-12)

### Bug Fixes

- **pepys:** order the review wait by claim time, not attempt number
  ([c67fab4](https://github.com/zgeoff/boxxy/commit/c67fab41c8062eb525e97136d0e297c710faba83))
- **pepys:** read the telemetry origin columns as the plug-in has them
  ([1b10edb](https://github.com/zgeoff/boxxy/commit/1b10edba2b4c67d4fcc632b492fdc1dd516b17e3))
- **pepys:** ship test-utils and check each export has a packed file
  ([b68d4b3](https://github.com/zgeoff/boxxy/commit/b68d4b3b15c05dabdf6406217a9874de37d46ebc))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.4

## 0.1.3 (2026-11-11)

### Features

- **pepys:** add the pepys package: sink, reader, fold and queries
  ([1a01080](https://github.com/zgeoff/boxxy/commit/1a010804302be6ef243ea4a31773a001a0e4b9b4))
- **pepys:** bind the package to the prerelease pepys kit
  ([9d58948](https://github.com/zgeoff/boxxy/commit/9d58948b9d69a66a0811e5ff9f89e270620e2ca0))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.3
