// A custom privileged scheme that serves block textures from the content pack
// to the renderer under a strict CSP (bw-texture://block/stone.png).
import { protocol } from 'electron';
import fs from 'node:fs';
import { resolveTextureFile } from './structure/content-pack';

export const TEXTURE_SCHEME = 'bw-texture';

/**
 * Declare the scheme as privileged. Must run at module load, before `app.ready`,
 * which is why this is a standalone call rather than part of registerTextureProtocol.
 */
export function registerTextureScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TEXTURE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
}

/** Wire up the request handler. Call after `app.ready`. */
export function registerTextureProtocol(): void {
  protocol.handle(TEXTURE_SCHEME, async (request) => {
    // bw-texture://asset/<namespace>/<path>.png -> <ns textures>/<path>.png.
    // The namespace lives in the path (not the host) so underscores are allowed.
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname).replace(/^\//, '').replace(/\.png$/, '');
    const resolved = resolveTextureFile(key);
    // Resolution is per-request so it tracks the active workspace, and the
    // prefix check keeps "../" keys from escaping the namespace root.
    if (!resolved || !resolved.file.startsWith(resolved.root) || !fs.existsSync(resolved.file)) {
      return new Response(null, { status: 404 });
    }
    const data = await fs.promises.readFile(resolved.file);
    return new Response(data, {
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=31536000',
      },
    });
  });
}
