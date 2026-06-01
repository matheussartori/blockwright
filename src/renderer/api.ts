// The single renderer→main bridge, exposed by preload via contextBridge.
import type { BlockwrightApi } from '@/shared/types';

export const api: BlockwrightApi = window.blockwright;
