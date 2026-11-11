import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { FactId } from '../types.ts';

export function buildMockFactId(): FactId {
  return brandSchemas.factId.parse(`manual:${faker.string.uuid({ version: 7 })}`);
}
