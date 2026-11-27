// Every verify feature holds these paths, so a change to any of them flags all nine. When you can't
// tell whether a path reaches a feature, add it here: a missed feature costs more than a journey.
export const corePaths = {
  // Package folders that every journey runs, each with the workspace packages it depends on, such
  // as `modules/train`, whose merge rule `modules/closeout` loads.
  packages: [
    // filing an item ends the attempts of the item it replaces and wakes the runner
    'modules/dispatch',

    // the example rules and their prompts, which the harness loads at every `up`
    'modules/rules',

    // the server checks the rules against these concepts each time it loads them
    'modules/planning',

    // the phase kinds, which the server registers with the rules
    'modules/closeout',

    // the store under every journey
    'adapters/store-sqlite',

    // every `up` serves the public door, and `doctor` signs in through it
    'adapters/auth-oauth',
  ],

  // Globs that skip the dependency walk: the server depends on every package, but most of its
  // handlers run only in one feature's journey.
  globs: [
    // shared code that every package imports
    'libs/**',

    // `doctor` reads a stage time from the real pepys that every `up` starts
    'packages/pepys/src/{boxxy-source,boxxy-work-plugin,build-boxxy-plugin,create-pepys-reader,index,types,wire-fact-schemas}.ts',
    'packages/pepys/src/{consumers,generated,queries,test-utils,work}/**',

    // the CLI's package files, its entry points, its argument parser, and the verify CLI and the
    // harness, so a change to them changes what every journey proves
    'apps/cli/*',
    'apps/cli/src/*',
    'apps/cli/src/{cli,test-utils}/**',

    // the hook plugin, which no journey loads
    'apps/cli/hook-plugin/**',

    // every journey files and reads items, and no journey runs the relation or auth commands
    'apps/cli/src/commands/{all-commands,auth-commands,item-commands,parse-criterion-flag,read-findings,read-item-body,relation-commands}.ts',

    // the server's package files and entry points, the access check on every call, the rules
    // loader, the outbox, and the test server that the harness runs
    'apps/server/*',
    'apps/server/src/*',
    'apps/server/src/{auth,outbox,rules,test-utils}/**',

    // the item handlers and what they import, the runner status that `doctor` reads, and the
    // handlers that no journey calls
    'apps/server/src/handlers/{api,auth-handlers,build-acceptance,build-owner-fact,build-runner-fact,collect-item-page,item-handlers,outbox-handlers,pick-call-ids,read-item-ids,read-last-lever-seq,relation-handlers,resolve-item-id,rules-handlers,runner-handlers,signoff-item-handler,to-wire-json,write-levers}.ts',
  ],
} as const;
