import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** Liefert das gebaute Frontend aus. Unbekannte Pfade bekommen index.html (SPA-Fallback). */
export function createStaticHandler(distDir: string): (req: Request) => Promise<Response> {
  const dist = resolve(distDir);
  const indexPath = join(dist, 'index.html');
  const hasDist = existsSync(indexPath);
  if (!hasDist) {
    console.warn(`[static] Kein Frontend-Build unter ${dist}. Im Dev-Modus Vite auf Port 5173 verwenden.`);
  }

  return async (req: Request): Promise<Response> => {
    if (!hasDist) {
      return new Response('Frontend nicht gebaut. Bitte `bun run build` ausführen.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    const filePath = join(dist, pathname);
    if (filePath !== dist && !filePath.startsWith(dist + sep)) return new Response('Not Found', { status: 404 });

    if (pathname !== '/' && isFile(filePath)) {
      const immutable = pathname.startsWith('/assets/');
      return new Response(Bun.file(filePath), {
        headers: { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' },
      });
    }
    return new Response(Bun.file(indexPath), {
      headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/html; charset=utf-8' },
    });
  };
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
