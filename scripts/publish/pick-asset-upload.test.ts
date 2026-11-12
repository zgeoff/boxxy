import { expect, test } from 'bun:test';
import { pickAssetUpload } from './pick-asset-upload.ts';

test('it uploads to a release that holds no assets', () => {
  expect(pickAssetUpload('{"assets":[]}')).toStrictEqual({ kind: 'upload' });
});

test('it uploads again to a release that holds the binary but no checksum file', () => {
  const text = JSON.stringify({ assets: [{ name: 'boxxy-linux-x64' }] });

  expect(pickAssetUpload(text)).toStrictEqual({ kind: 'upload' });
});

test('it leaves a release alone once its checksum file has finished its upload', () => {
  const text = JSON.stringify({
    assets: [
      { name: 'boxxy-linux-x64', state: 'uploaded', size: 109_000_000 },
      { name: 'boxxy-hook-plugin.tar.gz', state: 'uploaded', size: 416 },
      { name: 'SHA256SUMS', state: 'uploaded', size: 173 },
    ],
  });

  expect(pickAssetUpload(text)).toStrictEqual({ kind: 'complete' });
});

test('it uploads again to a release whose checksum file never finished its upload', () => {
  const text = JSON.stringify({
    assets: [
      { name: 'boxxy-linux-x64', state: 'uploaded', size: 109_000_000 },
      { name: 'boxxy-hook-plugin.tar.gz', state: 'uploaded', size: 416 },
      { name: 'SHA256SUMS', state: 'starter', size: 0 },
    ],
  });

  expect(pickAssetUpload(text)).toStrictEqual({ kind: 'upload' });
});

test('it uploads again to a release whose checksum file is empty', () => {
  const text = JSON.stringify({ assets: [{ name: 'SHA256SUMS', state: 'uploaded', size: 0 }] });

  expect(pickAssetUpload(text)).toStrictEqual({ kind: 'upload' });
});

test.each(['', 'not json', '{"assets":"none"}', '{"assets":[{"size":3}]}'])(
  'it refuses a release answer of %p',
  (text) => {
    expect(pickAssetUpload(text)).toStrictEqual({
      kind: 'invalid',
      message: 'gh release view gave no list of asset names',
    });
  },
);
