import { expect, test } from 'bun:test';
import { contentHash } from './content-hash.ts';
import { hashBytes } from './hash-bytes.ts';
import { hashTree } from './hash-tree.ts';

test('it hashes the canonical list of each file path, SHA-256 and executable bit', () => {
  const tree = hashTree([
    { path: 'a.md', bytes: new TextEncoder().encode('x'), executable: false },
  ]);

  expect<string>(tree).toBe('86cfcb28cd7fb5d7a4a0a5c79267e9e2c35960b3c0c66d3b757a3095f7aab3be');
});

test('it hashes the same files passed in another order the same', () => {
  const encoder = new TextEncoder();

  const walked = hashTree([
    { path: 'hooks/run.sh', bytes: encoder.encode('#!/bin/sh'), executable: true },
    { path: 'README.md', bytes: encoder.encode('# Plugin'), executable: false },
  ]);

  expect(walked).toBe(
    hashTree([
      { path: 'README.md', bytes: encoder.encode('# Plugin'), executable: false },
      { path: 'hooks/run.sh', bytes: encoder.encode('#!/bin/sh'), executable: true },
    ]),
  );
});

test('it hashes a file whose executable bit changed differently', () => {
  const encoder = new TextEncoder();

  const changed = hashTree([
    { path: 'hooks/run.sh', bytes: encoder.encode('#!/bin/sh'), executable: false },
  ]);

  expect(changed).not.toBe(
    hashTree([{ path: 'hooks/run.sh', bytes: encoder.encode('#!/bin/sh'), executable: true }]),
  );
});

test('it hashes a file whose bytes changed differently', () => {
  const encoder = new TextEncoder();

  const changed = hashTree([
    { path: 'README.md', bytes: encoder.encode('# Plugin v2'), executable: false },
  ]);

  expect(changed).not.toBe(
    hashTree([{ path: 'README.md', bytes: encoder.encode('# Plugin'), executable: false }]),
  );
});

test('it sorts the files by the UTF-8 bytes of their paths, not their UTF-16 code units', () => {
  const emoji = new TextEncoder().encode('emoji');
  const halfwidth = new TextEncoder().encode('halfwidth');

  const tree = hashTree([
    { path: '\u{1F600}.md', bytes: emoji, executable: false },
    { path: '\uFF61.md', bytes: halfwidth, executable: false },
  ]);

  expect(tree).toBe(
    contentHash([
      { path: '\uFF61.md', sha256: hashBytes(halfwidth), executable: false },
      { path: '\u{1F600}.md', sha256: hashBytes(emoji), executable: false },
    ]),
  );
});
