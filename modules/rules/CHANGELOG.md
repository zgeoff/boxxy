# Changelog

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.2.0...@boxxy/rules@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **model:** add the review, verify and merge ports and loader checks
  ([dd3a810](https://github.com/zgeoff/boxxy/commit/dd3a810e811a49abb235cc38dbf78857491c82a1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.1
    - @boxxy/model bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.9...@boxxy/rules@0.2.0) (2026-11-12)

### Bug Fixes

- **cli:** tell a worker session how to close out
  ([7d397e2](https://github.com/zgeoff/boxxy/commit/7d397e2919e652d825e40f83cebb4ac55e0716b0))
- **rules:** reject a rules file whose alias holds itself
  ([2227939](https://github.com/zgeoff/boxxy/commit/22279399d7246415a44e3d69f656ed009b0fff02))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.2.0
    - @boxxy/model bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.8...@boxxy/rules@0.1.9) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.9
    - @boxxy/model bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.7...@boxxy/rules@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.8
    - @boxxy/model bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.6...@boxxy/rules@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.7
    - @boxxy/model bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.5...@boxxy/rules@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.6
    - @boxxy/model bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.4...@boxxy/rules@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.5
    - @boxxy/model bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.3...@boxxy/rules@0.1.4) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/rules:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.4
    - @boxxy/model bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/rules@0.1.0...@boxxy/rules@0.1.3) (2026-11-11)

### Features

- **closeout:** add the four v1 phase kinds and the close-out limits
  ([e2a676c](https://github.com/zgeoff/boxxy/commit/e2a676c44ddbba3b574679c77106c7733a71ef68))
- **dispatch:** add the session bind and the stray session stop
  ([e93c65c](https://github.com/zgeoff/boxxy/commit/e93c65c7b46a90b8296a2e4ee460d19f81ebaf23))
- **model:** add the pipeline engine, v1 item state and rules dry run
  ([19b8013](https://github.com/zgeoff/boxxy/commit/19b80135241210e031c1b6631dd4b87f8c610396))
- **model:** add the v1 rows, ports, close-outs, facts and reports
  ([ae3c02e](https://github.com/zgeoff/boxxy/commit/ae3c02e88e144578e6dbd76dd0b1c6e080cc0259))
- **planning:** decide with limit seats, wakes first and pool backoff
  ([ee8f1a2](https://github.com/zgeoff/boxxy/commit/ee8f1a2e73d317b98c49c08536ba7b49420bb1b8))
- **rules:** load v1 pipelines, limits, pools, sleep and skills pin
  ([63d3d54](https://github.com/zgeoff/boxxy/commit/63d3d5447d81ddc0ac4b5b8684ee0a6b7a63c8bc))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/content-hash bumped to 0.1.3
    - @boxxy/model bumped to 0.1.3

## 0.1.0 (2026-11-08)

### Features

- **closeout:** parse the build close-out and dedupe its open items
  ([#42](https://github.com/zgeoff/boxxy/issues/42))
  ([d81fdfd](https://github.com/zgeoff/boxxy/commit/d81fdfd8dc2afded805e25268e0383fe6ee8b194))
- **rules:** load rules.yaml and build the plug-in registry
  ([#38](https://github.com/zgeoff/boxxy/issues/38))
  ([312f0db](https://github.com/zgeoff/boxxy/commit/312f0db3f6b3baa413ab086fc7b2977a1e5c6d35))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.2
