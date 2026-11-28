/** The private buckets a document list links into. */
export const FILE_BUCKETS = [
  "load-documents",
  "driver-documents",
  "truck-documents",
] as const
export type FileBucket = (typeof FILE_BUCKETS)[number]

/**
 * A link that opens a stored file when clicked (see documents/open). For
 * long lists: nothing is signed until someone opens it.
 */
export function fileHref(
  /** /org/<slug> */
  orgBase: string,
  bucket: FileBucket,
  path: string
) {
  return `${orgBase}/documents/open?${new URLSearchParams({ bucket, path })}`
}
