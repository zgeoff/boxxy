# Changelog

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.7...@boxxy/server@0.1.8) (2026-11-12)


### Bug Fixes

* **store-sqlite:** keep sqlite temp files in memory ([90700b8](https://github.com/zgeoff/boxxy/commit/90700b875e08eee115cc3619a3649018c1a3a9a3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @boxxy/caller-proof-imp bumped to 0.1.8
    * @boxxy/closeout bumped to 0.1.8
    * @boxxy/content-hash bumped to 0.1.8
    * @boxxy/contract bumped to 0.1.8
    * @boxxy/dispatch bumped to 0.1.8
    * @boxxy/forge-github bumped to 0.1.8
    * @boxxy/model bumped to 0.1.8
    * @boxxy/notifier-atc bumped to 0.1.8
    * @boxxy/pepys bumped to 0.1.8
    * @boxxy/planning bumped to 0.1.8
    * @boxxy/rules bumped to 0.1.8
    * @boxxy/store-sqlite bumped to 0.1.8
    * @boxxy/worker-atc bumped to 0.1.8

## [0.1.7](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.6...@boxxy/server@0.1.7) (2026-11-12)

### Features

- **worker-atc:** call atc through the gateway's mcp endpoint
  ([4565816](https://github.com/zgeoff/boxxy/commit/4565816e6c00e7a1ad7e77c296d13dd1350c704a))
- **worker-atc:** spawn a git workspace on targets with fresh machines
  ([578228e](https://github.com/zgeoff/boxxy/commit/578228ec91ec9f17e81021226f27bc7c3f081f28))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.7
    - @boxxy/closeout bumped to 0.1.7
    - @boxxy/content-hash bumped to 0.1.7
    - @boxxy/contract bumped to 0.1.7
    - @boxxy/dispatch bumped to 0.1.7
    - @boxxy/forge-github bumped to 0.1.7
    - @boxxy/model bumped to 0.1.7
    - @boxxy/notifier-atc bumped to 0.1.7
    - @boxxy/pepys bumped to 0.1.7
    - @boxxy/planning bumped to 0.1.7
    - @boxxy/rules bumped to 0.1.7
    - @boxxy/store-sqlite bumped to 0.1.7
    - @boxxy/worker-atc bumped to 0.1.7

## [0.1.6](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.5...@boxxy/server@0.1.6) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/server:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.6
    - @boxxy/closeout bumped to 0.1.6
    - @boxxy/content-hash bumped to 0.1.6
    - @boxxy/contract bumped to 0.1.6
    - @boxxy/dispatch bumped to 0.1.6
    - @boxxy/forge-github bumped to 0.1.6
    - @boxxy/model bumped to 0.1.6
    - @boxxy/notifier-atc bumped to 0.1.6
    - @boxxy/pepys bumped to 0.1.6
    - @boxxy/planning bumped to 0.1.6
    - @boxxy/rules bumped to 0.1.6
    - @boxxy/store-sqlite bumped to 0.1.6
    - @boxxy/worker-atc bumped to 0.1.6

## [0.1.5](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.4...@boxxy/server@0.1.5) (2026-11-12)

### Bug Fixes

- **server:** follow symlinks when reading the trust documents
  ([defda7f](https://github.com/zgeoff/boxxy/commit/defda7f8def03c8556d812e65a85cc2fb53ca265))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.5
    - @boxxy/closeout bumped to 0.1.5
    - @boxxy/content-hash bumped to 0.1.5
    - @boxxy/contract bumped to 0.1.5
    - @boxxy/dispatch bumped to 0.1.5
    - @boxxy/forge-github bumped to 0.1.5
    - @boxxy/model bumped to 0.1.5
    - @boxxy/notifier-atc bumped to 0.1.5
    - @boxxy/pepys bumped to 0.1.5
    - @boxxy/planning bumped to 0.1.5
    - @boxxy/rules bumped to 0.1.5
    - @boxxy/store-sqlite bumped to 0.1.5
    - @boxxy/worker-atc bumped to 0.1.5

## [0.1.4](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.3...@boxxy/server@0.1.4) (2026-11-12)

### Miscellaneous Chores

- **@boxxy/server:** Synchronize boxxy versions

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.4
    - @boxxy/closeout bumped to 0.1.4
    - @boxxy/content-hash bumped to 0.1.4
    - @boxxy/contract bumped to 0.1.4
    - @boxxy/dispatch bumped to 0.1.4
    - @boxxy/forge-github bumped to 0.1.4
    - @boxxy/model bumped to 0.1.4
    - @boxxy/notifier-atc bumped to 0.1.4
    - @boxxy/pepys bumped to 0.1.4
    - @boxxy/planning bumped to 0.1.4
    - @boxxy/rules bumped to 0.1.4
    - @boxxy/store-sqlite bumped to 0.1.4
    - @boxxy/worker-atc bumped to 0.1.4

## 0.1.3 (2026-11-11)

### Features

- **server:** serve the boxxy procedures and run the runner tick
  ([34c7b6b](https://github.com/zgeoff/boxxy/commit/34c7b6b13800ec461e473fce3c6ad1fa07c78389))

### Bug Fixes

- **dispatch:** check the hook's pull request link again in its lock
  ([e0552be](https://github.com/zgeoff/boxxy/commit/e0552be52ce78f1ad3a42a9ae091c1f2c05639bb))
- **server:** refuse browser requests and cap the health check body
  ([ae341f3](https://github.com/zgeoff/boxxy/commit/ae341f32a11e24d9de57e51e2e29cb774f6d8500))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.3
    - @boxxy/closeout bumped to 0.1.3
    - @boxxy/content-hash bumped to 0.1.3
    - @boxxy/contract bumped to 0.1.3
    - @boxxy/dispatch bumped to 0.1.3
    - @boxxy/forge-github bumped to 0.1.3
    - @boxxy/model bumped to 0.1.3
    - @boxxy/notifier-atc bumped to 0.1.3
    - @boxxy/pepys bumped to 0.1.3
    - @boxxy/planning bumped to 0.1.3
    - @boxxy/rules bumped to 0.1.3
    - @boxxy/store-sqlite bumped to 0.1.3
    - @boxxy/worker-atc bumped to 0.1.3
