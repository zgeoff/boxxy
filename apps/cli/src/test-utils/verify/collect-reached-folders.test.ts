import { expect, test } from 'bun:test';
import { collectReachedFolders } from './collect-reached-folders.ts';

test.each([
  {
    title: 'a seed with no dependencies',
    seeds: ['modules/kettle'],
    packages: [{ folder: 'modules/kettle', name: '@boxxy/kettle', workspaceDependencies: [] }],
    reached: ['modules/kettle'],
  },
  {
    title: 'the dependencies of a dependency',
    seeds: ['adapters/kettle-steam'],
    packages: [
      {
        folder: 'adapters/kettle-steam',
        name: '@boxxy/kettle-steam',
        workspaceDependencies: ['@boxxy/kettle'],
      },
      { folder: 'modules/kettle', name: '@boxxy/kettle', workspaceDependencies: ['@boxxy/clock'] },
      { folder: 'libs/clock', name: '@boxxy/clock', workspaceDependencies: [] },
      { folder: 'modules/teapot', name: '@boxxy/teapot', workspaceDependencies: [] },
    ],
    reached: ['adapters/kettle-steam', 'libs/clock', 'modules/kettle'],
  },
  {
    title: 'each package of a cycle once',
    seeds: ['modules/cup'],
    packages: [
      { folder: 'modules/cup', name: '@boxxy/cup', workspaceDependencies: ['@boxxy/saucer'] },
      { folder: 'modules/saucer', name: '@boxxy/saucer', workspaceDependencies: ['@boxxy/cup'] },
    ],
    reached: ['modules/cup', 'modules/saucer'],
  },
  {
    title: 'a seed folder with no package, as after its deletion',
    seeds: ['modules/gone'],
    packages: [],
    reached: ['modules/gone'],
  },
  {
    title: 'no folder for a dependency outside the workspace',
    seeds: ['modules/kettle'],
    packages: [
      {
        folder: 'modules/kettle',
        name: '@boxxy/kettle',
        workspaceDependencies: ['@boxxy/elsewhere'],
      },
    ],
    reached: ['modules/kettle'],
  },
])('it reaches $title', (row) => {
  expect(collectReachedFolders(row.seeds, row.packages)).toStrictEqual([...row.reached]);
});
