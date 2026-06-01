// Tiny path helpers for the renderer (no Node `path` available across the bridge).
// Handle both POSIX and Windows separators since recents may come from either.

export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : '';
}
