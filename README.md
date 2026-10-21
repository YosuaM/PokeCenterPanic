# PokéCenter Panic

PokéCenter Panic is a noncommercial cooperative browser game in development. The [functional and technical specification](docs/specification.md) describes the planned MVP.

## Development

Planned work and progress are tracked on the [PokéCenter Panic Trello board](https://trello.com/b/jnnB9u4p/pokecenter-panic). The [Trello ticket conventions](skills/pokecenter-trello-tickets/SKILL.md) define card content and status changes.

This repository uses npm workspaces: `apps/client` contains the Phaser/Vite browser app, `apps/server` contains the Colyseus server, and `packages/shared` contains values and types used by both.

Use Node.js 22.12 or newer and npm 10 or newer. From the repository root:

```sh
npm ci
npm run dev
```

The client opens at `http://127.0.0.1:5173`; Colyseus listens on port `2567` by default. Set `PORT` when starting the server to use a different port, and set `VITE_SERVER_URL` to the matching server origin if the client must connect elsewhere. `npm run dev:client` and `npm run dev:server` start each app separately.

Enter a player name and select **Create room**. Share the displayed six-character code; up to three others can join from separate browser sessions. Codes are case-insensitive. Choose a Pokémon, mark yourself ready, and have the host select **Start game** once everyone is ready. A three-second countdown leads into the patient-care prototype. Rooms default to four seats; set `ROOM_CAPACITY=1`, `2`, or `3` before starting the server to test a smaller room. Invalid codes and full rooms show distinct errors. Rooms are held in memory and disappear when empty or when the server restarts.

The provisional map shows every connected player. Move your own character with WASD or the arrow keys; the most recently pressed direction wins, with no diagonal movement. The server validates movement against map boundaries and solid stations, then synchronizes positions to all players. Movement stops when the browser loses focus or input becomes stale. Players can pass through one another.

To render PMD sprites locally, run `npm run assets:pmd` before starting the client. This fills a Git-ignored cache for the six patient species and four player characters. The game uses provisional markers if the cache is absent. See [external sprite sources and credits](docs/asset-sources.md) for terms and attribution; do not commit downloaded assets.

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
