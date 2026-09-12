# NeeDo production image compression evidence

- Images: 289
- Source bytes: 86719554
- Result bytes: 65739485
- Saved bytes: 20980069
- Savings ratio: 24.19%
- Optimized: 2
- Lossless: 72
- Kept original: 215
- Threshold failures: 0
- Manifest SHA-256: 64e825f0084e57db89a3abebf434596a2e781d1d95f10b6cdafb05cee3771ab4

## Quality controls

- Every changed PNG decodes to byte-identical RGBA pixels (SSIM 1.0); this avoids palette banding around gradients, UI text, logos, icons, and transparent artwork.
- The only two lossy changes are existing JPEG photographs. Their decoded-image SSIM values are 0.997753 and 0.998147, both above the 0.995 photo threshold.
- Dimensions, format, alpha presence, frame count, output hash, policy hash, and per-file quality records are checked by the read-only release gate.
- Manual before/after inspection covered the homepage carousel, login/error artwork, large character PNGs, the largest lossless reductions, and both lossy JPEG photographs. No visible text damage, banding, shape change, or objectionable detail loss remained after the conservative rerun.
