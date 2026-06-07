// Reference-image attachments staged in the Generate composer: the accepted MIME
// types, the staged-attachment shape, and reading dropped/pasted/picked files into
// base64 data URLs. Pure (no React) so the composer just renders the result.
//
// A data URL is `data:<mime>;base64,<payload>`. The <img> preview uses it whole; for
// IPC it's split into { mediaType, data } so only the base64 payload crosses (see
// state/generation.ts runGeneration).

/** Image MIME types Claude accepts as reference attachments. */
export const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** A reference image staged in the composer (and echoed into the sent message). */
export interface Attachment {
  id: string;
  /** Full `data:<mime>;base64,…` URL — used for the <img> preview and, split, for IPC. */
  dataUrl: string;
}

/** Whether a file is an accepted reference image (the drop/paste guard). */
export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE.includes(file.type);
}

/** Read image files into base64-data-URL {@link Attachment}s, skipping non-images.
 *  @param files - The dropped/pasted/picked files.
 *  @returns The accepted images as staged attachments (rejects only on read error). */
export function readImages(files: Iterable<File>): Promise<Attachment[]> {
  const reads = Array.from(files)
    .filter(isAcceptedImage)
    .map(
      (f) =>
        new Promise<Attachment>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve({ id: crypto.randomUUID(), dataUrl: String(r.result) });
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        }),
    );
  return Promise.all(reads);
}
