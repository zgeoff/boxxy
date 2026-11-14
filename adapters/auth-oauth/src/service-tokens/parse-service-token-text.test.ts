import { expect, test } from 'bun:test';
import { parseServiceTokenText } from './parse-service-token-text.ts';

test('it parses a client with a secret digest and both scopes', () => {
  const text = JSON.stringify({
    resource: 'https://boxxy.example/mcp',
    clients: {
      'dock-reader': {
        scopes: ['read', 'write'],
        secretDigests: ['8f5dce3101b35b758cca5d0a431e6cbbf9619a6614d38cbdc7d5294db5a06804'],
      },
    },
  });

  expect(parseServiceTokenText(text)).toStrictEqual({
    ok: true,
    file: {
      resource: 'https://boxxy.example/mcp',
      clients: [
        {
          name: 'dock-reader',
          scopes: ['read', 'write'],
          tokens: [],
          secretDigests: ['8f5dce3101b35b758cca5d0a431e6cbbf9619a6614d38cbdc7d5294db5a06804'],
        },
      ],
    },
  });
});

test('it parses a file with no clients as one that serves none', () => {
  const text = JSON.stringify({ resource: 'https://boxxy.example/mcp', clients: {} });

  expect(parseServiceTokenText(text)).toStrictEqual({
    ok: true,
    file: { resource: 'https://boxxy.example/mcp', clients: [] },
  });
});

test.each([
  { problem: 'is not JSON', text: '{"resource":' },
  {
    problem: 'names a scope boxxy does not know',
    text: JSON.stringify({
      resource: 'https://boxxy.example/mcp',
      clients: {
        'dock-reader': {
          scopes: ['admin'],
          secretDigests: ['8f5dce3101b35b758cca5d0a431e6cbbf9619a6614d38cbdc7d5294db5a06804'],
        },
      },
    }),
  },
  {
    problem: 'holds a static token',
    text: JSON.stringify({
      resource: 'https://boxxy.example/mcp',
      clients: {
        'dock-reader': { scopes: ['read'], tokens: ['boxxy_svc_dockreaderdockreaderdockreader01'] },
      },
    }),
  },
  {
    problem: 'has a field the file does not take',
    text: JSON.stringify({ resource: 'https://boxxy.example/mcp', clients: {}, extra: true }),
  },
])('it refuses a file that $problem', (row) => {
  expect(parseServiceTokenText(row.text)).toStrictEqual({ ok: false, reason: expect.any(String) });
});

test.each([
  { problem: 'a malformed token', token: 'boxxy_svc_leak' },
  { problem: 'a well-formed token', token: 'boxxy_svc_leakleakleakleakleakleakleakleak01' },
])('it never quotes $problem in the reason', (row) => {
  const text = JSON.stringify({
    resource: 'https://boxxy.example/mcp',
    clients: { 'dock-reader': { scopes: ['read'], tokens: [row.token] } },
  });

  expect(JSON.stringify(parseServiceTokenText(text))).not.toContain(row.token);
});
