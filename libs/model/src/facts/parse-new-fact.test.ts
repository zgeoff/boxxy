import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { parseNewFact } from './parse-new-fact.ts';

test('it returns a fact whose payload its type accepts', () => {
  const fact = {
    id: brandSchemas.factId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
    actor: 'boxxy:owner:local',
    payload: { seq: 1, text: 'The lamp flickers on start.' },
  } as const;

  expect(parseNewFact(fact)).toStrictEqual(fact);
});

test('it throws on a payload that its type refuses', () => {
  const fact = {
    id: brandSchemas.factId.parse('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'),
    type: 'boxxy.item.noted',
    entity: 'boxxy:item:0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
    actor: 'boxxy:owner:local',
    payload: { seq: 0, text: '' },
  } as const;

  expect(() => parseNewFact(fact)).toThrowWithMessage(Error, /boxxy\.item\.noted/u);
});
