import { expect, test } from 'bun:test';
import { checkDeployment } from '@pepys/kit';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import { buildForeignStandIn } from './build-foreign-stand-in.ts';

test('it brings the entity kinds and consumers that a deployment of the boxxy plug-in needs', () => {
  const standIn = buildForeignStandIn();

  const checked = checkDeployment({
    name: 'boxxy-test',
    plugins: [buildBoxxyPlugin(standIn.foreign), ...standIn.plugins],
  });

  expect(checked.ok).toBe(true);
});
