import { WringerError } from '@wringer/core';
import type { HttpClient } from '@wringer/http';
import { mcpDoorMetadataPath } from '../constants.ts';
import { parseDoorMetadata } from './parse-door-metadata.ts';

// The doctor's check that the public door at `origin` answers. The http driver sends the GET to
// the door.
export async function checkMCPDoor(
  http: Pick<HttpClient, 'request'>,
  origin: string,
): Promise<{ resource: string }> {
  const answer = await http.request({ method: 'GET', path: mcpDoorMetadataPath });

  const resource = parseDoorMetadata(answer, origin);

  if (resource === null) {
    throw new WringerError('check-failed', {
      message: `the door at ${origin} answered ${answer.status} on ${mcpDoorMetadataPath}, where it answers 200 with the resource ${origin}/mcp`,
      hint: `Check that the boxxy server at ${origin} runs with a publicDoor section, then run \`bun verify doctor\` again.`,
    });
  }

  return { resource };
}
