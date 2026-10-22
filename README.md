# PokéCenter Panic

PokéCenter Panic is a noncommercial cooperative browser game in development. The [functional and technical specification](docs/specification.md) describes the planned MVP.

The [MVP visual asset guide](docs/visual-assets.md) covers the original center environment, PMD character sprites, asset inventory, and scale decisions.

## Development

Planned work and progress are tracked on the [PokéCenter Panic Trello board](https://trello.com/b/jnnB9u4p/pokecenter-panic). The [Trello ticket conventions](skills/pokecenter-trello-tickets/SKILL.md) define card content and status changes.

This repository uses npm workspaces: `apps/client` contains the Phaser/Vite browser app, `apps/server` contains the Colyseus server, and `packages/shared` contains values and types used by both.

Use Node.js 22.12 or newer and npm 10 or newer. From the repository root:

```sh
npm ci
npm run dev
```

The client opens at `http://127.0.0.1:5173`; Colyseus listens on port `2567` by default. Set `PORT` when starting the server to use a different port, and set `VITE_SERVER_URL` to the matching server origin if the client must connect elsewhere. `npm run dev:client` and `npm run dev:server` start each app separately.

Enter a player name and select **Create room**. Share the displayed six-character code; up to three others can join from separate browser sessions. The host can also select **+ Add bot** on any open seat; bots are always ready, play to their Pokémon's specialty and give up their Pokémon if a person chooses it. Codes are case-insensitive. Choose a Pokémon, mark yourself ready, and have the host select **Start game** once everyone is ready. A three-second countdown leads into the patient-care prototype. Rooms default to four seats; set `ROOM_CAPACITY=1`, `2`, or `3` before starting the server to test a smaller room. Invalid codes and full rooms show distinct errors. An interrupted connection reserves its seat for 30 seconds; the same tab retries automatically, and a reload can restore the seat from that tab's session. **Leave room** releases the seat immediately. An empty room closes after 60 seconds without a connected player. Rooms are held in memory and disappear when the server restarts.

The compact center map shows every connected player. Staff start behind a central counter; two passages, one on each side of it, lead to the lobby, where patients wait on sofas beside the entrance. Discharge sits in the middle of the counter and works from either side. Move your own character with WASD or the arrow keys; the most recently pressed direction wins, with no diagonal movement. Each Pokémon has a specialty: Chansey's machines heal faster, Audino prepares medicine in 1 s, Machoke carries patients faster and repairs in 1 s, and Meowth walks faster. Hold Q at a seated patient for Chansey's Soft-Boiled (heals the injury in place) or Audino's Calm (restores patience). The server validates movement against map boundaries and solid stations, then synchronizes positions to all players. Movement stops when the browser loses focus or input becomes stale. Players can pass through one another.

Rounds last six minutes, with no new arrivals during the final thirty seconds. The first four patients introduce one station at a time: an injured Pikachu, a burned Charmander, a poisoned Bulbasaur and a Squirtle that needs both healing and Burn Heal. Later patients need two treatments more often as the round goes on (10%, then 25% after two minutes, then 40% after four) and arrive with less patience (90, 80, then 70 seconds). A one-line tip explains each kind of action the first time it becomes available. Discharging a fully treated patient awards 100 points plus up to 50 for remaining patience; consecutive discharges add a streak bonus of 10 per patient after the first, up to 50, and losing a patient deducts 50 and resets the streak. The HUD shows the shared clock and score. At the deadline, remaining patients count as unfinished, and the results show points, patient counts, success rate, stars and the best streak. The host can select **Return to lobby** to play again with the same room code and characters; everyone must mark ready again. Results also remain available after reconnecting.

Both healing machines accept injured patients. Between 1:00 and 5:30, an active Pikachu at half patience or less can cause an outage, once per Pikachu and with a sixty-second global cooldown. Only one machine can be broken at a time. Its red status light, sound cue and HUD warning identify the outage; healing pauses while the patient's patience keeps decreasing. Approach with empty hands and hold **E** for two seconds to repair it. Releasing E, moving, losing focus or disconnecting cancels repair progress. The machine then resumes its remaining treatment time, or becomes empty if its patient was lost.

To render PMD sprites locally, run `npm run assets:pmd` before starting the client. This fills a Git-ignored cache for the six patient species and four player characters. The game uses provisional markers if the cache is absent. See [external sprite sources and credits](docs/asset-sources.md) for terms and attribution; do not commit downloaded assets.

To export the original center art after editing its SVG sources, run `npm run assets:original` on macOS. The exporter refreshes the floor and fixture layers, composite preview, stretcher, medicine bottle, and medical icon PNGs. These original assets are tracked in the repository. The room shell, reception counter, waiting sofas and recovery bay are generated by Blender scripts in `art/source/blender`; run one with `Blender -b --factory-startup -P art/source/blender/<asset>.py` to rebuild its source, GLB, preview and manifest.

Before handing off changes, run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The production server starts with `npm run start -w @pokecenter/server` after a build. The client build is in `apps/client/dist`.

## License

Original software in this repository is licensed under [GNU GPL version 3 only](LICENSE) (`GPL-3.0-only`). GPL permits commercial use of the code and requires distributed covered derivatives to remain under GPL.

Copyright (C) 2026 YosuaM.

This license does not grant rights to Pokémon names, characters, designs, trademarks, or third-party assets. External resources are not included in this repository and remain subject to their respective owners' terms.
