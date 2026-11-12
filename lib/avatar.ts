export const AVATAR_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]
/** Largest picture accepted before it's shrunk in the browser. */
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_SIZE = 256

/** Why a picture can't be used, or null if it's fine. */
export function avatarFileError(file: File) {
  if (!AVATAR_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG, WebP or GIF image."
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Choose an image under 10 MB."
  }
  return null
}

/**
 * Crops a picture to a centred square and shrinks it to 256×256 WebP, so
 * uploads are small and every avatar has the same shape.
 */
export async function toAvatarImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas isn't supported.")
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  )
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't read the image.")),
      "image/webp",
      0.9
    )
  )
}
