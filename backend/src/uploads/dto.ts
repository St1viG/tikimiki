/**
 * No request-body validation is needed for the uploads module — the payloads
 * are multipart file streams handled by multer (FileInterceptor), not JSON.
 *
 * The runtime shape of the file object multer hands us is declared locally as
 * `UploadedImage` (rather than relying on the ambient `Express.Multer.File`
 * namespace, which is only present when `@types/multer` is installed).
 */

/** Minimal subset of multer's in-memory file object that this module reads. */
export interface UploadedImage {
  /** Original client-side filename, e.g. "photo.png". */
  originalname: string;
  /** MIME type reported by the client, e.g. "image/png". */
  mimetype: string;
  /** File contents (memory storage — the default for FileInterceptor). */
  buffer: Buffer;
  /** Byte size of the file. */
  size: number;
}
