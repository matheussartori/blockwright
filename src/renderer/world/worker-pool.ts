// A small pool of chunk-mesh workers. Builds geometry off the main thread, load-balancing across
// N workers with an internal queue so a burst of chunk requests doesn't overwhelm one worker.
// Jobs can be cancelled (a chunk evicted before its mesh returns) so no wasted main-thread work.
import type { MaterialBuffers, NeighborBorders } from '../viewer/geometry-core';
import type { ChunkMeshRequest, ChunkMeshResponse, LodLevel } from './worker-protocol';
import type { ChunkRenderPayload } from '@/shared/types';
import type { TexInfo } from '../viewer/model-geometry';

interface Job {
  req: ChunkMeshRequest;
  resolve: (buffers: MaterialBuffers[]) => void;
  cancelled: boolean;
}

interface Slot {
  worker: Worker;
  job: Job | null;
}

const poolSize = (): number => {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(4, cores - 1)); // each worker holds a THREE bundle — cap it
};

export class WorkerPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private jobs = new Map<number, Job>();

  constructor(size = poolSize()) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./chunk-mesh.worker.ts', import.meta.url), { type: 'module' });
      const slot: Slot = { worker, job: null };
      worker.onmessage = (e: MessageEvent<ChunkMeshResponse>) => this.onDone(slot, e.data);
      this.slots.push(slot);
    }
  }

  /** Queue a chunk build; resolves with its material buffers (or never, if cancelled). Returns the
   *  job id so the caller can cancel it. */
  build(
    lod: LodLevel,
    payload: ChunkRenderPayload,
    tex: [string, TexInfo][],
    borders: NeighborBorders | undefined,
    resolve: (buffers: MaterialBuffers[]) => void,
  ): number {
    const id = this.nextId++;
    const job: Job = { req: { id, lod, payload, tex, borders }, resolve, cancelled: false };
    this.jobs.set(id, job);
    this.queue.push(job);
    this.pump();
    return id;
  }

  /** Cancel a queued or in-flight job — its result (if any) is dropped. */
  cancel(id: number): void {
    const job = this.jobs.get(id);
    if (job) job.cancelled = true;
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job) continue;
      let job = this.queue.shift();
      while (job && job.cancelled) {
        this.jobs.delete(job.req.id);
        job = this.queue.shift();
      }
      if (!job) return;
      slot.job = job;
      slot.worker.postMessage(job.req);
    }
  }

  private onDone(slot: Slot, res: ChunkMeshResponse): void {
    const job = slot.job;
    slot.job = null;
    if (job) {
      this.jobs.delete(job.req.id);
      if (!job.cancelled) job.resolve(res.buffers);
    }
    this.pump();
  }

  dispose(): void {
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
    this.queue = [];
    this.jobs.clear();
  }
}
