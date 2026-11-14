import { expect, test } from 'bun:test';
import { parseDoorMetadata } from './parse-door-metadata.ts';

test('it gives the resource of a door that names its origin', () => {
  const resource = parseDoorMetadata(
    {
      status: 200,
      json: {
        resource: 'https://pantry.example/mcp',
        authorization_servers: ['https://pantry.example'],
      },
    },
    'https://pantry.example',
  );

  expect(resource).toBe('https://pantry.example/mcp');
});

test.each([
  {
    fault: 'a status other than 200',
    status: 404,
    json: {
      resource: 'https://pantry.example/mcp',
      authorization_servers: ['https://pantry.example'],
    },
  },
  { fault: 'a body that is not metadata', status: 200, json: { error: 'not_found' } },
  {
    fault: 'another resource',
    status: 200,
    json: {
      resource: 'https://larder.example/mcp',
      authorization_servers: ['https://pantry.example'],
    },
  },
  {
    fault: 'another authorization server',
    status: 200,
    json: {
      resource: 'https://pantry.example/mcp',
      authorization_servers: ['https://larder.example'],
    },
  },
])('it gives null for a door that answers with $fault', (row) => {
  expect(parseDoorMetadata(row, 'https://pantry.example')).toBeNull();
});
