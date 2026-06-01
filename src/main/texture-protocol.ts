// A custom privileged scheme that serves block textures from the content pack
// to the renderer under a strict CSP (bw-texture://block/stone.png).
import { protocol } from 'electron';
import fs from 'node:fs';
import { textureFile, texturesDir } from './structure/content-pack';

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
  const root = texturesDir();
  protocol.handle(TEXTURE_SCHEME, async (request) => {
    // bw-texture://block/stone.png -> <textures>/block/stone.png
    const url = new URL(request.url);
    const key = decodeURIComponent(url.host + url.pathname).replace(/\.png$/, '');
    const file = textureFile(key);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      return new Response(null, { status: 404 });
    }
    const data = await fs.promises.readFile(file);
    return new Response(data, {
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=31536000',
      },
    });
  });
}
