import { PROJECT_INFO } from '@pokecenter/shared';
import { createGameServer, resolveCapacity, resolvePort } from './server.js';

const port = resolvePort(process.env.PORT);
const server = createGameServer({ capacity: resolveCapacity(process.env.ROOM_CAPACITY) });

await server.listen(port);
console.info(`${PROJECT_INFO.title} server listening on port ${port}`);
