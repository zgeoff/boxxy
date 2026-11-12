import { cliAssetNames } from './constants.ts';

export type AssetUpload =
  | { readonly kind: 'upload' }
  | { readonly kind: 'complete' }
  | { readonly kind: 'invalid'; readonly message: string };

// The checksum file goes up last, so a release that holds it finished holds the whole set. GitHub
// keeps an asset whose upload failed in the state `starter`. A rerun never replaces a whole set:
// Bun does not promise the same bytes from a second compile, and other bytes break every pin.
export function pickAssetUpload(viewText: string): AssetUpload {
  const assets = parseAssets(viewText);

  if (assets === null) {
    return { kind: 'invalid', message: 'gh release view gave no list of asset names' };
  }

  const isComplete = assets.some(
    (asset) =>
      asset.name === cliAssetNames.checksums &&
      asset.state === 'uploaded' &&
      typeof asset.size === 'number' &&
      asset.size > 0,
  );

  return isComplete ? { kind: 'complete' } : { kind: 'upload' };
}

interface ReleaseAsset {
  readonly name: string;

  readonly state: unknown;

  readonly size: unknown;
}

function parseAssets(text: string): ReleaseAsset[] | null {
  const parsed = parseJSON(text);

  if (typeof parsed !== 'object' || parsed === null || !('assets' in parsed)) {
    return null;
  }

  const assets: unknown = parsed.assets;

  if (!Array.isArray(assets)) {
    return null;
  }

  const named = assets.flatMap((asset: unknown): ReleaseAsset[] =>
    typeof asset === 'object' && asset !== null && 'name' in asset && typeof asset.name === 'string'
      ? [
          {
            name: asset.name,
            state: 'state' in asset ? asset.state : undefined,
            size: 'size' in asset ? asset.size : undefined,
          },
        ]
      : [],
  );

  return named.length === assets.length ? named : null;
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}
