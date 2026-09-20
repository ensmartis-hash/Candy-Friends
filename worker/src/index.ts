// Candy Friends — Worker Entry Point
// Cloudflare Worker + Hono + Durable Objects

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GameRoom } from './GameRoom';

// Type for Cloudflare Env
export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

// Hono app
const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ ok: true, service: 'candy-friends-worker' }));

// WebSocket upgrade → Durable Object
app.get('/room/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const id = c.env.GAME_ROOM.idFromName(code);
  const stub = c.env.GAME_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

// Room info (for lobby polling before WS connect)
app.get('/room/:code/info', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const id = c.env.GAME_ROOM.idFromName(code);
  const stub = c.env.GAME_ROOM.get(id);
  const resp = await stub.fetch(new Request(`http://internal/info`, { method: 'GET' }));
  return resp;
});

// Create new room → returns room code
app.post('/room', async (c) => {
  const code = generateRoomCode();
  const id = c.env.GAME_ROOM.idFromName(code);
  const stub = c.env.GAME_ROOM.get(id);
  // Initialize room by calling it
  await stub.fetch(new Request(`http://internal/init`, { method: 'POST' }));
  return c.json({ code, wsUrl: `${new URL(c.req.url).origin}/room/${code}` });
});

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default app;
export { GameRoom } from './GameRoom';