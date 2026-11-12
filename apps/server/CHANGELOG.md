# Changelog

## [0.2.0](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.9...@boxxy/server@0.2.0) (2026-11-12)

### Features

- **notices:** retry notices with backoff and keep each key on its row
  ([#89](https://github.com/zgeoff/boxxy/issues/89))
  ([b172a2b](https://github.com/zgeoff/boxxy/commit/b172a2bc47610f1a3ddf246a9123db6898358f07))
- **server:** refuse an item for a repo the configuration does not name
  ([e41d6f9](https://github.com/zgeoff/boxxy/commit/e41d6f9e8c10177d1d7bf5503d8a8003bac24bd2))

### Bug Fixes

- **contract:** drop the held bind answer that no server sends
  ([9dff204](https://github.com/zgeoff/boxxy/commit/9dff204ea202f6338ddd2f1b521693fa7ce2de76))
- **server:** ignore git replace objects when reading the rules
  ([e02a010](https://github.com/zgeoff/boxxy/commit/e02a010b039f4c4d7824e6676671ba20c7db13c7))
- **server:** load rules only from a commit the rules ref holds
  ([abbede7](https://github.com/zgeoff/boxxy/commit/abbede794514234930dd431ea331e0b2ac740907))
- **server:** read the rules from the checked commit, never the tree
  ([f87a6e1](https://github.com/zgeoff/boxxy/commit/f87a6e167aece6abe0bfd05d9b9227006d18cdc1))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.2.0
    - @boxxy/closeout bumped to 0.2.0
    - @boxxy/content-hash bumped to 0.2.0
    - @boxxy/contract bumped to 0.2.0
    - @boxxy/dispatch bumped to 0.2.0
    - @boxxy/forge-github bumped to 0.2.0
    - @boxxy/model bumped to 0.2.0
    - @boxxy/notifier-atc bumped to 0.2.0
    - @boxxy/pepys bumped to 0.2.0
    - @boxxy/planning bumped to 0.2.0
    - @boxxy/rules bumped to 0.2.0
    - @boxxy/store-sqlite bumped to 0.2.0
    - @boxxy/worker-atc bumped to 0.2.0

## [0.1.9](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.8...@boxxy/server@0.1.9) (2026-11-12)

### Features

- **server:** name the clone token variable of a git source
  ([bb0c0d1](https://github.com/zgeoff/boxxy/commit/bb0c0d1ecdac12235afc70d1911845053b3adf89))

### Bug Fixes

- **dispatch:** give no second claim of an item in one tick
  ([c4e2f27](https://github.com/zgeoff/boxxy/commit/c4e2f27d33d66882d27ecfae68105a018ea35963))
- **server:** close an item as a duplicate when the relation is live
  ([245af0a](https://github.com/zgeoff/boxxy/commit/245af0ab2956662e140a119e1077f238bf161540))
- **server:** log the reason of a refused spawn
  ([5969fea](https://github.com/zgeoff/boxxy/commit/5969feaa9b6322bbefbba1e6dbe689dc5527bc18))
- **server:** log the reason of a refused wake and atc's problem
  ([1f6ef46](https://github.com/zgeoff/boxxy/commit/1f6ef468e5ad74cad84490e3f4eec587e70873e3))
- **server:** log the sessions whose forget the worker refused
  ([5bd31dd](https://github.com/zgeoff/boxxy/commit/5bd31dd131c4c35d4dbdafcb01e3bd5c4bca0299))
- **worker-atc:** pair each clone token variable with its configured url
  ([c2ac3d7](https://github.com/zgeoff/boxxy/commit/c2ac3d75ef9f1a8ec944d3d52cdf6b6acc99aef3))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.9
    - @boxxy/closeout bumped to 0.1.9
    - @boxxy/content-hash bumped to 0.1.9
    - @boxxy/contract bumped to 0.1.9
    - @boxxy/dispatch bumped to 0.1.9
    - @boxxy/forge-github bumped to 0.1.9
    - @boxxy/model bumped to 0.1.9
    - @boxxy/notifier-atc bumped to 0.1.9
    - @boxxy/pepys bumped to 0.1.9
    - @boxxy/planning bumped to 0.1.9
    - @boxxy/rules bumped to 0.1.9
    - @boxxy/store-sqlite bumped to 0.1.9
    - @boxxy/worker-atc bumped to 0.1.9

## [0.1.8](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.1.7...@boxxy/server@0.1.8) (2026-11-12)

### Bug Fixes

- **store-sqlite:** keep sqlite temp files in memory
  ([90700b8](https://github.com/zgeoff/boxxy/commit/90700b875e08eee115cc3619a3649018c1a3a9a3))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/caller-proof-imp bumped to 0.1.8
    - @boxxy/closeout bumped to 0.1.8
    - @boxxy/content-hash bumped to 0.1.8
    - @boxxy/contract bumped to 0.1.8
    - @boxxy/dispatch bumped to 0.1.8
    - @boxxy/forge-github bumped to 0.1.8
    - @boxxy/model bumped to 0.1.8
    - @boxxy/notifier-atc bumped to 0.1.8
    - @boxxy/pepys bumped to 0.1.8
    - @boxxy/planning bumped to 0.1.8
    - @boxxy/rules bumped to 0.1.8
    - @boxxy/store-sqlite bumped to 0.1.8
    - @boxxy/worker-atc bumped to 0.1.8

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
