import type { CloseOutLimits } from './types.ts';

// The byte limits of a close-out, measured on the JSON of the value as stored. A close-out of
// 120,000 bytes makes a `closed_out` fact under half of the 256 KiB a fact may take on the wire,
// so a layer that escapes the JSON once more still fits.
export const closeOutLimits: CloseOutLimits = {
  closeOutBytes: 120_000,
  noslopReportBytes: 32_768,
};
