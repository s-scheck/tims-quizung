import { serve, type Server } from 'bun';
import { getCategories, getCategory } from '@quiz/content';
import './games/sort/index.ts';
import { createStaticHandler } from './http/static.ts';
import { RoomRegistry } from './rooms/registry.ts';
import type { CategoryProvider } from './rooms/room.ts';
import { RealScheduler, type Scheduler } from './rooms/scheduler.ts';
import { Hub, type WsData } from './ws/hub.ts';
import { TokenBucket } from './ws/ratelimit.ts';

export interface ServerOptions {
  port?: number;
  hostname?: string;
  distDir: string;
  ttlMs?: number;
  sweepIntervalMs?: number;
  scheduler?: Scheduler;
  categories?: CategoryProvider;
  random?: () => number;
}

export interface QuizServer {
  server: Server<WsData>;
  registry: RoomRegistry;
  hub: Hub;
  url: string;
  stop(): void;
}

export function createServer(opts: ServerOptions): QuizServer {
  const scheduler = opts.scheduler ?? new RealScheduler();
  const categories: CategoryProvider = opts.categories ?? { list: getCategories, get: getCategory };
  const serveStatic = createStaticHandler(opts.distDir);

  // Hub und Registry verweisen aufeinander, deshalb die späte Zuweisung.
  let hub: Hub | undefined;
  const registry = new RoomRegistry({
    scheduler,
    categories,
    random: opts.random,
    ttlMs: opts.ttlMs,
    onChange: (room) => hub?.broadcast(room),
    onRoomClosed: (room) => hub?.closeRoomSockets(room.code),
  });

  const server = serve<WsData>({
    port: opts.port ?? 3000,
    hostname: opts.hostname,
    routes: {
      '/health': () => Response.json({ ok: true, rooms: registry.size, uptime: Math.round(process.uptime()) }),
      '/ws': (req: Request, srv: Server<WsData>) => {
        const upgraded = srv.upgrade(req, {
          data: { code: null, role: null, playerId: null, bucket: new TokenBucket() },
        });
        return upgraded ? undefined : new Response('WebSocket erwartet', { status: 426 });
      },
    },
    fetch: (req) => serveStatic(req),
    websocket: {
      idleTimeout: 120,
      maxPayloadLength: 16 * 1024,
      message: (ws, raw) => hub?.onMessage(ws, raw),
      close: (ws) => hub?.onClose(ws),
    },
  });

  hub = new Hub(registry, (topic, data) => server.publish(topic, data));

  const sweeper = setInterval(() => {
    const removed = registry.sweep();
    if (removed.length > 0) console.log(`[rooms] ${removed.length} inaktive Räume entfernt: ${removed.join(', ')}`);
  }, opts.sweepIntervalMs ?? 60_000);

  return {
    server,
    registry,
    hub,
    url: `http://${server.hostname}:${server.port}`,
    stop() {
      clearInterval(sweeper);
      for (const room of registry.all()) registry.remove(room.code);
      server.stop(true);
    },
  };
}
