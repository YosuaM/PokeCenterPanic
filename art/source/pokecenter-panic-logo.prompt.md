# PokéCenter Panic title logo

Source: `pokecenter-panic-logo.png` (1774 × 887, RGBA).
Runtime: `../../apps/client/public/assets/original/pokecenter-panic-logo.webp` (240,422 bytes; alpha preserved).

Original illustrated title artwork with a transparent background, shared by the entry screen and header. The image contains no external fonts or copied third-party artwork.

## Initial prompt

Use case: logo-brand.
Asset type: final transparent title-screen logo for the cooperative browser game PokéCenter Panic.
Create one polished, original game wordmark as a single isolated cutout on a genuinely transparent alpha background. Wide landscape composition, roughly 2:1 aspect ratio, tightly framed with only a small clear margin. This is a game logo asset, not a mockup or a scene.
Exact text, in two lines: "POKÉCENTER" above "PANIC". Spell the top line P-O-K-É-C-E-N-T-E-R, including the accent. No other text or slogans.
Design: expressive custom chunky hand-lettered arcade typography with slightly playful irregular angles, a strong compact silhouette, warm cream top lettering, larger golden yellow-to-coral PANIC lettering. Thick deep plum outlines, a crisp cream sticker edge and a restrained coral offset shadow. Flat cel-shaded, hand-painted game title finish, clean confident contours, a few controlled highlights. The lettering must remain instantly legible at 300 pixels wide.
Integrate one small original coral-and-cream monster-clinic badge above or alongside the center of the wordmark: a friendly round medical kit emblem with a simple plus sign, a tiny heart and a little energetic lightning/spark accent. Keep decorative details subordinate to the words. Make it feel like a charming, chaotic cooperative monster-care game.
Palette: warm ivory #fff2d5, coral #f47c83, sunny yellow #ffd75c, lavender #ad8be2, deep plum #352448. Designed to look excellent against a deep indigo twilight pixel-art clinic background and rounded white/coral UI.
Avoid: existing official Pokémon logo typography, a copy of another game's logo, real organizations' emblems, character portraits, backgrounds, rectangles, checkerboard patterns, floor shadows, mockup surfaces, excessive sparkles, tiny text, watermarks. Preserve the transparent background around and between the logo elements. One logo only, no variations sheet.

## Framing refinement

Use case: precise-object-edit. Edit target: the attached transparent PokéCenter Panic logo. Preserve the exact lettering, wording, spelling, warm ivory/coral/yellow/plum palette, medical bag emblem, heart, lightning bolt, stethoscope and illustrated finish. Change only the framing: the current artwork touches and slightly clips the canvas at the top, left and right. Give the complete uncut logo a clean transparent margin of at least 6% of the image width on every side. Keep the logo in a wide landscape composition with genuine alpha transparency. Restore the complete top outline of the medical bag handle and all outer cream borders where needed. No added background, no checkerboard, no white rectangle, no extra elements, no change to text. The full title must read "POKÉCENTER PANIC" with the accent.

## Runtime export

```sh
cwebp -q 92 -m 6 -alpha_q 100 art/source/pokecenter-panic-logo.png -o apps/client/public/assets/original/pokecenter-panic-logo.webp
```

## Animated version

The entry-screen title uses `apps/client/src/ui/logo-motion.css`: a 900 ms elastic entrance followed by an eight-second loop with gentle floating and a short wobble. The existing WebP remains the image source. CSS transforms preserve layout dimensions; reduced-motion users receive the static title, and hiding the entry screen removes its active animations.

Shareable exports in `art/exports/`:

- `pokecenter-panic-logo-animated.svg`: self-contained original WebP and the same motion CSS, at 1774 × 887. Open in a browser to play the entrance and loop. Respects reduced motion.
- `pokecenter-panic-logo-animated.webp`: transparent 888 × 444 loop, eight seconds at 20 fps. This raster export repeats the idle motion without the entrance. Image viewers must support animated WebP; it does not respond to reduced-motion preferences.

The SVG embeds the runtime WebP as a base64 image and the motion stylesheet verbatim. The WebP was rendered from that SVG in Chrome with a transparent viewport, sampling the animation from 900 ms to 8850 ms in 50 ms steps, then encoded with `img2webp -loop 0 -kmax 0 -lossy -q 82 -m 2 -d 50`. Regenerate both exports when the original logo or motion CSS changes. Asset tests verify the embedded image/style, dimensions, alpha, loop duration and distinct frames.
