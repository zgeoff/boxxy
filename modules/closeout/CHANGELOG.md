# Changelog

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.3...@boxxy/closeout@0.1.4) (2026-11-12)

### Bug Fixes

- **release:** list test-util imports as peers and check imports
  ([f9e64a2](https://github.com/zgeoff/boxxy/commit/f9e64a2b787341b1ea994018205b01799f1fed38))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.4
  - devDependencies
    - @boxxy/planning bumped to 0.1.4
    - @boxxy/rules bumped to 0.1.4

## [0.1.3](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.0...@boxxy/closeout@0.1.3) (2026-11-11)

### Features

- **closeout:** add the four v1 phase kinds and the close-out limits
  ([e2a676c](https://github.com/zgeoff/boxxy/commit/e2a676c44ddbba3b574679c77106c7733a71ef68))
- **model:** add the v1 rows, ports, close-outs, facts and reports
  ([ae3c02e](https://github.com/zgeoff/boxxy/commit/ae3c02e88e144578e6dbd76dd0b1c6e080cc0259))

### Bug Fixes

- **closeout:** fail a phase by outcome name, keep failed evidence off
  ([f8b2f54](https://github.com/zgeoff/boxxy/commit/f8b2f543a4a95511f908b7c6cb8b23d019e5c7c0))
- **dispatch:** settle a close-out that repeats a relation or a close
  ([8a8af90](https://github.com/zgeoff/boxxy/commit/8a8af90b8eee28242ea33edb37b65b3f45ca7008))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.3
  - devDependencies
    - @boxxy/planning bumped to 0.1.3
    - @boxxy/rules bumped to 0.1.3

## 0.1.0 (2026-11-08)

### Features

- **closeout:** parse the build close-out and dedupe its open items
  ([#42](https://github.com/zgeoff/boxxy/issues/42))
  ([d81fdfd](https://github.com/zgeoff/boxxy/commit/d81fdfd8dc2afded805e25268e0383fe6ee8b194))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.2
