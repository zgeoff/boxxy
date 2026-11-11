import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { FactId } from '../types.ts';

export function buildMockFactId(): FactId {
  return brandSchemas.factId.parse(faker.string.uuid({ version: 7 }));
}
