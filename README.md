# Candy Friends

Co-op multiplayer game. Up to 9 players collect Sweet Cores, restore substations, and survive a 15-minute match.

## Layout

- `shared/` — protocol types, game constants, and character data
- `worker/` — Cloudflare Worker + Durable Object (`GameRoom`)
- `client/` — game client (not started yet)

The worker runs a 20 Hz authoritative simulation over WebSocket + MessagePack, with 20-tile interest filtering and a 100-tick reconnect replay buffer.

## Setup

```bash
cd shared
npm install

cd ../worker
npm install
npm test
npm run dev
```

Create a room with `POST /room`, then connect to `GET /room/:code` over WebSocket.
