# External sprite sources

## PMD Collab Sprite Repository

- Source: https://github.com/PMDCollab/SpriteCollab and https://sprites.pmdcollab.org/
- Terms: the repository describes community submissions under Creative Commons Attribution-NonCommercial 4.0; the project is a noncommercial fan game. Pokémon characters and any official Chunsoft-origin sprite artwork may involve rights that the community license cannot grant. Verify suitability before any public game release.
- Attribution: each imported species retains its upstream `credits.txt` and the generated `manifest.json` records the full credit line. Display these artist credits when distributing or showing the artwork. The upstream credit registry is https://github.com/PMDCollab/SpriteCollab/blob/master/credit_names.txt.
- Source layout: `sprite/<dex-id>/AnimData.xml`, `credits.txt`, `Idle-Anim.png`, and optionally `Walk-Anim.png`. Player species also import `Dance-Anim.png` when available, falling back to `Rotate-Anim.png` for the selection celebration. Patient species import `Laying-Anim.png` for the stretcher pose, falling back to `Sleep-Anim.png` (Psyduck has no Laying sheet); without either, carried patients keep Idle. Frame durations are in sixtieths of a second. Sheet columns are frames; rows are PMD directions, starting south and proceeding counterclockwise.
- Access: the importer downloads files into `apps/client/public/assets/external/pmd/`, which Git ignores. The browser loads only this local cache, so deployed builds do not hotlink GitHub. The importer checks PNG dimensions against XML, requires credits, and reports missing or malformed files. A production deployment must provision the cache separately after reviewing rights and attribution.

Run `npm run assets:pmd` to populate the local cache. The game falls back to provisional markers if it is absent. No downloaded sprite, generated sheet, or copied upstream license is tracked in this repository.

The lobby character cards and room player portraits reuse local Idle and selection celebration sheets for Chansey, Audino, Machoke, and Meowth. The client validates the manifest, credits, and sheet dimensions, animates all south-facing frames with their original durations (1/60-second units), and crops the union of their visible pixels in memory so no frame is clipped. Picker and roster portraits share validated sprite data. Unselected cards stay Idle; a newly server-confirmed selection and its room portrait play one complete Dance when available, otherwise Rotate, then return to Idle. Readiness updates do not restart the celebration; a new choice does. All four current player species provide Rotate rather than Dance. Missing, malformed or unavailable optional celebrations retain Idle; older Idle-only caches remain supported. Hidden screens and tabs pause the animations; reduced-motion preferences freeze the first Idle frame. No additional third-party images or generated portrait copies are distributed in the repository. The title screen draws the same local Idle/Walk sheets for Chansey, Meowth and the patients on its ambience canvas, plus Lugia gliding across the sky; Lugia is scenery only and never loads into the clinic. The existing sprite credits remain visible in the menu's Credits dialog. A missing or invalid sheet leaves a labeled fallback without disabling character selection.

### Idle, Walk and selection sprite credits checked on 2026-10-22

| Species | PMD folder | Artist credit in upstream record |
|---|---|---|
| Pikachu | `0025` | CHUNSOFT |
| Bulbasaur | `0001` | CHUNSOFT |
| Charmander | `0004` | CHUNSOFT |
| Squirtle | `0007` | CHUNSOFT |
| Eevee | `0133` | CHUNSOFT |
| Psyduck | `0054` | CHUNSOFT |
| Chansey | `0113` | CHUNSOFT |
| Audino | `0531` | baronessfaron; JFain appears in the prior credit record |
| Machoke | `0067` | CHUNSOFT |
| Meowth | `0052` | CHUNSOFT |
| Lugia | `0249` | CHUNSOFT (title-screen scenery only; Idle and Walk) |

The source marks most selected sheets as CHUNSOFT-origin. Its community license cannot grant rights over those original sprites. Keep these assets local until release rights are reviewed; the repository contains only the importer and text credits.
