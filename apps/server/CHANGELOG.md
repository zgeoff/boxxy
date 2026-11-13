# Changelog

## [0.2.5](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.2.4...@boxxy/server@0.2.5) (2026-11-13)

### Features

- **api:** let a session list and read the items of its repo
  ([c1ff07c](https://github.com/zgeoff/boxxy/commit/c1ff07c940a9b3554e454c973c246cf671b093ec))
- **dispatch:** let design and build close-outs record a wait on an item
  ([f07d757](https://github.com/zgeoff/boxxy/commit/f07d7579ae4b8574895ffede061942a84f2422fd))
- **forge:** call github as the boxxy app with an installation token
  ([4164945](https://github.com/zgeoff/boxxy/commit/4164945e21f27d3908f3d8d1495b194b8b2e3a73))
- **server:** let the owner set and clear the security mark
  ([baa4439](https://github.com/zgeoff/boxxy/commit/baa4439a5d98eea4b177bf7e3d9b33db153627e8))
- **train:** merge a reviewed, green, verified pull request at its head
  ([3f09760](https://github.com/zgeoff/boxxy/commit/3f09760bad1cb9d409dd2930a5dacdb7679f11d8))

### Bug Fixes

- **api:** hide kept sessions and hidden relations from session reads
  ([0c141ce](https://github.com/zgeoff/boxxy/commit/0c141ce62d9920318996444f0c08f8749799bd77))
- **dispatch:** compare-and-set a job's action mark on the row it read
  ([84b4bd2](https://github.com/zgeoff/boxxy/commit/84b4bd2aa5803acf015e88b00b9a8e0819b37091))
- **dispatch:** time out a job attempt whose read throws past its limit
  ([06d8303](https://github.com/zgeoff/boxxy/commit/06d830391eb9596d3883779d3d4c4e202a09e364))
- **server:** refuse a boxxy app key that is not rsa
  ([6a94338](https://github.com/zgeoff/boxxy/commit/6a9433889d7ea239b7bf342fdba47136090d3a76))
- **server:** refuse malformed boxxy app keys at start
  ([a80197b](https://github.com/zgeoff/boxxy/commit/a80197bb5e88aa56074bfee2201700e1862a9fa9))
- **train:** hold a merge that has no pull request or head to read
  ([635679a](https://github.com/zgeoff/boxxy/commit/635679adcf42020d8022f4c1b843c15e96b7d21d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/auth-oauth bumped to 0.2.5
    - @boxxy/caller-proof-imp bumped to 0.2.5
    - @boxxy/closeout bumped to 0.2.5
    - @boxxy/content-hash bumped to 0.2.5
    - @boxxy/contract bumped to 0.2.5
    - @boxxy/dispatch bumped to 0.2.5
    - @boxxy/forge-github bumped to 0.2.5
    - @boxxy/model bumped to 0.2.5
    - @boxxy/notifier-atc bumped to 0.2.5
    - @boxxy/pepys bumped to 0.2.5
    - @boxxy/planning bumped to 0.2.5
    - @boxxy/review-noslop bumped to 0.2.5
    - @boxxy/rules bumped to 0.2.5
    - @boxxy/store-sqlite bumped to 0.2.5
    - @boxxy/verifier-wringer bumped to 0.2.5
    - @boxxy/worker-atc bumped to 0.2.5

## [0.2.4](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.2.3...@boxxy/server@0.2.4) (2026-11-13)

### Features

- **dispatch:** file, list and release held items
  ([8b43b30](https://github.com/zgeoff/boxxy/commit/8b43b305c89d1f3dcced47779634441830f3f3fd))
- **rules:** keep the read-only clone token to review sessions
  ([9bd4803](https://github.com/zgeoff/boxxy/commit/9bd4803e3e27cf641b8b2403dae4618e0458a592))

### Bug Fixes

- **dispatch:** refuse a retry of a held item so release starts at triage
  ([6e00400](https://github.com/zgeoff/boxxy/commit/6e0040069efcebbb958f4dbb248b423302bdc506))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/auth-oauth bumped to 0.2.4
    - @boxxy/caller-proof-imp bumped to 0.2.4
    - @boxxy/closeout bumped to 0.2.4
    - @boxxy/content-hash bumped to 0.2.4
    - @boxxy/contract bumped to 0.2.4
    - @boxxy/dispatch bumped to 0.2.4
    - @boxxy/forge-github bumped to 0.2.4
    - @boxxy/model bumped to 0.2.4
    - @boxxy/notifier-atc bumped to 0.2.4
    - @boxxy/pepys bumped to 0.2.4
    - @boxxy/planning bumped to 0.2.4
    - @boxxy/review-noslop bumped to 0.2.4
    - @boxxy/rules bumped to 0.2.4
    - @boxxy/store-sqlite bumped to 0.2.4
    - @boxxy/worker-atc bumped to 0.2.4

## [0.2.3](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.2.2...@boxxy/server@0.2.3) (2026-11-12)

### Features

- **dispatch:** run job attempts in the tick
  ([dbb6b5c](https://github.com/zgeoff/boxxy/commit/dbb6b5c63844557723fa82ffbf3762c1415dc1e9))

### Bug Fixes

- **server:** load the rules check's rules from the checkout alone
  ([3147e9e](https://github.com/zgeoff/boxxy/commit/3147e9e466d044b473103a541b78ee7ff6c94450))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/auth-oauth bumped to 0.2.3
    - @boxxy/caller-proof-imp bumped to 0.2.3
    - @boxxy/closeout bumped to 0.2.3
    - @boxxy/content-hash bumped to 0.2.3
    - @boxxy/contract bumped to 0.2.3
    - @boxxy/dispatch bumped to 0.2.3
    - @boxxy/forge-github bumped to 0.2.3
    - @boxxy/model bumped to 0.2.3
    - @boxxy/notifier-atc bumped to 0.2.3
    - @boxxy/pepys bumped to 0.2.3
    - @boxxy/planning bumped to 0.2.3
    - @boxxy/review-noslop bumped to 0.2.3
    - @boxxy/rules bumped to 0.2.3
    - @boxxy/store-sqlite bumped to 0.2.3
    - @boxxy/worker-atc bumped to 0.2.3

## [0.2.2](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.2.1...@boxxy/server@0.2.2) (2026-11-12)

### Features

- **review:** add the review phase on the noslop review gate
  ([303381e](https://github.com/zgeoff/boxxy/commit/303381ec2850ee40231148e0ee7931a49a30e9c3))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/auth-oauth bumped to 0.2.2
    - @boxxy/caller-proof-imp bumped to 0.2.2
    - @boxxy/closeout bumped to 0.2.2
    - @boxxy/content-hash bumped to 0.2.2
    - @boxxy/contract bumped to 0.2.2
    - @boxxy/dispatch bumped to 0.2.2
    - @boxxy/forge-github bumped to 0.2.2
    - @boxxy/model bumped to 0.2.2
    - @boxxy/notifier-atc bumped to 0.2.2
    - @boxxy/pepys bumped to 0.2.2
    - @boxxy/planning bumped to 0.2.2
    - @boxxy/review-noslop bumped to 0.2.2
    - @boxxy/rules bumped to 0.2.2
    - @boxxy/store-sqlite bumped to 0.2.2
    - @boxxy/worker-atc bumped to 0.2.2

## [0.2.1](https://github.com/zgeoff/boxxy/compare/@boxxy/server@0.2.0...@boxxy/server@0.2.1) (2026-11-12)

### Features

- **item:** add the item body and build the launch prompt from it
  ([#94](https://github.com/zgeoff/boxxy/issues/94))
  ([ad95f62](https://github.com/zgeoff/boxxy/commit/ad95f621adc62bec07a941c79cfbc8942fcbc2f1))
- **model:** add the review, verify and merge ports and loader checks
  ([dd3a810](https://github.com/zgeoff/boxxy/commit/dd3a810e811a49abb235cc38dbf78857491c82a1))
- **server:** read the notice session and its token from the environment
  ([645e9bd](https://github.com/zgeoff/boxxy/commit/645e9bd5f6c5c7324f109e16c21b4f29afd85824))
- **server:** serve the owner mcp tools on a public oauth door
  ([#91](https://github.com/zgeoff/boxxy/issues/91))
  ([ebacd1c](https://github.com/zgeoff/boxxy/commit/ebacd1c1f7d86567326a405ce273992faed3f046))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @boxxy/auth-oauth bumped to 0.2.1
    - @boxxy/caller-proof-imp bumped to 0.2.1
    - @boxxy/closeout bumped to 0.2.1
    - @boxxy/content-hash bumped to 0.2.1
    - @boxxy/contract bumped to 0.2.1
    - @boxxy/dispatch bumped to 0.2.1
    - @boxxy/forge-github bumped to 0.2.1
    - @boxxy/model bumped to 0.2.1
    - @boxxy/notifier-atc bumped to 0.2.1
    - @boxxy/pepys bumped to 0.2.1
    - @boxxy/planning bumped to 0.2.1
    - @boxxy/rules bumped to 0.2.1
    - @boxxy/store-sqlite bumped to 0.2.1
    - @boxxy/worker-atc bumped to 0.2.1

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
