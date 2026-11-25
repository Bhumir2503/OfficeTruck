// The organization's icon: cropped to a square and shrunk in the browser to a
// 256×256 PNG, so it's small, the same shape everywhere, and can go straight
// into the packet PDF.

export const ICON_TYPES = ["image/png", "image/jpeg", "image/webp"]
/** Largest picture accepted before it's shrunk. */
export const ICON_MAX_BYTES = 10 * 1024 * 1024

/** Why a picture can't be used as the icon, or null if it's fine. */
export function iconFileError(file: File) {
  if (!ICON_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG or WebP image."
  }
  if (file.size > ICON_MAX_BYTES) {
    return "Choose an image under 10 MB."
  }
  return null
}

const ICON_SIZE = 256

/** Crops a picture to a centred square and shrinks it to a 256×256 PNG. */
export async function toIconImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
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
    ICON_SIZE,
    ICON_SIZE
  )
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't read the image.")),
      "image/png"
    )
  )
}
