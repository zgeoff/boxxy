# Changelog

## [0.2.6](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.5...@boxxy/closeout@0.2.6) (2026-11-13)


### Miscellaneous Chores

* **@boxxy/closeout:** Synchronize boxxy versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/model bumped to 0.2.6
    * @boxxy/train bumped to 0.2.6
  * devDependencies
    * @boxxy/planning bumped to 0.2.6
    * @boxxy/rules bumped to 0.2.6

## [0.2.5](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.4...@boxxy/closeout@0.2.5) (2026-11-13)

### Features

- **closeout:** add needs-owner and split triage outcomes
  ([046b848](https://github.com/zgeoff/boxxy/commit/046b8481e76b26278eddf56fd138a5dbcb83b05e))
- **closeout:** carry a blocked build or triage question into the retry
  ([616a9eb](https://github.com/zgeoff/boxxy/commit/616a9eb946dcf5455c20f8d3abcceafeb657149a))
- **closeout:** let a design carry a conclusion for the next build
  ([c0cd27d](https://github.com/zgeoff/boxxy/commit/c0cd27de061efad0d152024c01286f8d6f5d0961))
- **closeout:** let a design close-out set acceptance and file items
  ([1fae644](https://github.com/zgeoff/boxxy/commit/1fae64432325058409d68831ed625ddd16646764))
- **closeout:** let a triage close-out set the item body
  ([9eb8f5b](https://github.com/zgeoff/boxxy/commit/9eb8f5b5f7dd3bb7172a2e4a6d31ff83b03100e9))
- **closeout:** let a triage relation make the item wait on another
  ([e977518](https://github.com/zgeoff/boxxy/commit/e977518c2fa41e52d8f3365cf8236601a732416d))
- **closeout:** let an open item name its kind and the security mark
  ([63a2df4](https://github.com/zgeoff/boxxy/commit/63a2df4d995057017eb12a272f47d480cf395919))
- **closeout:** start a design on an item with no acceptance list
  ([5944fcc](https://github.com/zgeoff/boxxy/commit/5944fccbb8a1570661781bfa22fba28f94380495))
- **dispatch:** carry a blocked design's reason into the next design
  ([f1c2293](https://github.com/zgeoff/boxxy/commit/f1c229379b74366f15fdd0a188ff6616dbf4413d))
- **dispatch:** let design and build close-outs record a wait on an item
  ([f07d757](https://github.com/zgeoff/boxxy/commit/f07d7579ae4b8574895ffede061942a84f2422fd))
- **train:** merge a reviewed, green, verified pull request at its head
  ([3f09760](https://github.com/zgeoff/boxxy/commit/3f09760bad1cb9d409dd2930a5dacdb7679f11d8))

### Bug Fixes

- **dispatch:** skip a close-out relation whose reverse is live
  ([102db78](https://github.com/zgeoff/boxxy/commit/102db78c9e74f725bd7d7c095cd67d4990080f00))
- **train:** hold a merge that has no pull request or head to read
  ([635679a](https://github.com/zgeoff/boxxy/commit/635679adcf42020d8022f4c1b843c15e96b7d21d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.5
    - @boxxy/train bumped to 0.2.5
  - devDependencies
    - @boxxy/planning bumped to 0.2.5
    - @boxxy/rules bumped to 0.2.5

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.3...@boxxy/closeout@0.2.4) (2026-11-13)

### Features

- **closeout:** send a failed verify's features to the rework build
  ([c5222b0](https://github.com/zgeoff/boxxy/commit/c5222b0cecfc49b52198e2e9353f351e658f4908))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.4
  - devDependencies
    - @boxxy/planning bumped to 0.2.4
    - @boxxy/rules bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.2...@boxxy/closeout@0.2.3) (2026-11-12)

### Features

- **closeout:** add the verify phase on the build's kept session
  ([94b58de](https://github.com/zgeoff/boxxy/commit/94b58de300eee536b3ad2a156fa668cfa221d751))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.3
  - devDependencies
    - @boxxy/planning bumped to 0.2.3
    - @boxxy/rules bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.1...@boxxy/closeout@0.2.2) (2026-11-12)

### Features

- **review:** add the review phase on the noslop review gate
  ([303381e](https://github.com/zgeoff/boxxy/commit/303381ec2850ee40231148e0ee7931a49a30e9c3))

### Bug Fixes

- **model:** read review close-outs stored before the review gate
  ([41f9de3](https://github.com/zgeoff/boxxy/commit/41f9de311c52fc915dfba989156d0277fef0707c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.2
  - devDependencies
    - @boxxy/planning bumped to 0.2.2
    - @boxxy/rules bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.2.0...@boxxy/closeout@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **model:** add the review, verify and merge ports and loader checks
  ([dd3a810](https://github.com/zgeoff/boxxy/commit/dd3a810e811a49abb235cc38dbf78857491c82a1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.1
  - devDependencies
    - @boxxy/planning bumped to 0.2.1
    - @boxxy/rules bumped to 0.2.1

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.9...@boxxy/closeout@0.2.0) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.2.0
  - devDependencies
    - @boxxy/planning bumped to 0.2.0
    - @boxxy/rules bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.8...@boxxy/closeout@0.1.9) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.9
  - devDependencies
    - @boxxy/planning bumped to 0.1.9
    - @boxxy/rules bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.7...@boxxy/closeout@0.1.8) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.8
  - devDependencies
    - @boxxy/planning bumped to 0.1.8
    - @boxxy/rules bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.6...@boxxy/closeout@0.1.7) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.7
  - devDependencies
    - @boxxy/planning bumped to 0.1.7
    - @boxxy/rules bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.5...@boxxy/closeout@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.6
  - devDependencies
    - @boxxy/planning bumped to 0.1.6
    - @boxxy/rules bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/closeout@0.1.4...@boxxy/closeout@0.1.5) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/closeout:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/model bumped to 0.1.5
  - devDependencies
    - @boxxy/planning bumped to 0.1.5
    - @boxxy/rules bumped to 0.1.5

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
