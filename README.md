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

The client opens at `http://127.0.0.1:5173`; Colyseus listens on port `2567` by default. Set `PORT` when starting the server to use a different port. `npm run dev:client` and `npm run dev:server` start each app separately. The initial server exposes a minimal `prototype` room to verify the transport; private room codes and joining rules are planned in the next card.

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
