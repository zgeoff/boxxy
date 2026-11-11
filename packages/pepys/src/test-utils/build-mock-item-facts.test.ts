import { expect, test } from 'bun:test';
import { buildMockItemFacts } from './build-mock-item-facts.ts';

test('it builds 21 facts in time order with fact IDs f01 to f21', () => {
  const scenario = buildMockItemFacts();

  expect(scenario.facts.map((fact) => fact.id)).toStrictEqual(
    Array.from(
      { length: 21 },
      (_unused, index) => `event:boxxy:f${`${index + 1}`.padStart(2, '0')}`,
    ),
  );
});

test('it builds facts whose times never go back', () => {
  const scenario = buildMockItemFacts();
  const times = scenario.facts.map((fact) => fact.at);

  expect(times).toStrictEqual(times.toSorted());
});

test('it builds a settled fact for each of the five attempts', () => {
  const scenario = buildMockItemFacts();

  const settled = scenario.facts
    .filter((fact) => fact.type === 'boxxy.attempt.settled')
    .map((fact) => fact.payload.attempt);

  expect(settled).toStrictEqual(Object.values(scenario.attempts));
});
