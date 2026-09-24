import { join } from 'node:path';
import { createServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
const ttlMinutes = Number(process.env.ROOM_TTL_MINUTES ?? 120);
const distDir = process.env.WEB_DIST ?? join(import.meta.dir, '..', '..', 'web', 'dist');

const app = createServer({ port, hostname: '0.0.0.0', distDir, ttlMs: ttlMinutes * 60_000 });

console.log(`[server] läuft auf ${app.url}  (Räume verfallen nach ${ttlMinutes} min Inaktivität)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal}, fahre herunter`);
    app.stop();
    process.exit(0);
  });
}
