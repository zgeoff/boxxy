import { faker } from '@faker-js/faker';
import { brandSchemas } from '../brand-schemas.ts';
import type { FactId } from '../types/core.ts';

export function buildMockFactId(): FactId {
  return brandSchemas.factId.parse(`manual:${faker.string.uuid({ version: 7 })}`);
}
