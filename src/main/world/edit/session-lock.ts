// `session.lock` citizenship — the guard against the #1 documented corruption cause of every
// world editor: writing while Minecraft has the world open.
//
// What the game does (modern `DirectoryLock`): opens `session.lock`, writes the snowman marker
// (`☃`), and holds an exclusive OS file lock (FileChannel.lock — MANDATORY on Windows, advisory
// fcntl on macOS/Linux) for as long as the world is open.
//
// What we can do from Node (no flock/fcntl in the runtime):
//   • Windows: Java's lock is mandatory, so our open/write on the locked file FAILS — that
//     failure IS the detection, and while we hold our own handle a launching Minecraft's lock
//     attempt fails symmetrically. Full citizenship.
//   • macOS/Linux: the lock is advisory and Node can't participate in it, so a running game is
//     NOT reliably detectable here. We still (re)write the marker and hold the handle open for
//     the session. Callers must treat POSIX as `bestEffort` and keep the enforced backups as the
//     real safety net. (A native flock wrapper is the known upgrade path.)
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Vanilla's `session.lock` content: the snowman, UTF-8. */
const SNOWMAN = Buffer.from('☃', 'utf8');

export class WorldLockedError extends Error {
  constructor(root: string) {
    super(`the world at ${root} is open in Minecraft (session.lock is held) — close it before editing`);
    this.name = 'WorldLockedError';
  }
}

export interface SessionLock {
  /** True when the platform gave us a REAL exclusivity signal (Windows mandatory locking);
   *  false when the hold is advisory-only (POSIX) and callers should surface a caution. */
  exclusive: boolean;
  release(): Promise<void>;
}

/**
 * Acquire the session lock for a save folder.
 *
 * @throws {WorldLockedError} When the OS reports the file is held by another process (Windows
 *   with Minecraft running — EBUSY/EPERM/EACCES on open or write).
 */
export async function acquireSessionLock(root: string): Promise<SessionLock> {
  const lockPath = path.join(root, 'session.lock');
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(lockPath, 'w');
    await handle.writeFile(SNOWMAN);
    await handle.sync().catch(() => undefined);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') throw new WorldLockedError(root);
    throw e;
  }
  let released = false;
  return {
    exclusive: process.platform === 'win32',
    release: async () => {
      if (released) return;
      released = true;
      await handle.close().catch(() => undefined);
    },
  };
}
