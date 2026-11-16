// Company logos: shrunk in the browser to a PNG that fits in 800×300, so it
// stays crisp on the invoice and can go straight into the packet PDF.

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]
/** Largest picture accepted before it's shrunk. */
export const LOGO_MAX_BYTES = 10 * 1024 * 1024
const MAX_WIDTH = 800
const MAX_HEIGHT = 300

/** Why a picture can't be used as the logo, or null if it's fine. */
export function logoFileError(file: File) {
  if (!LOGO_TYPES.includes(file.type)) {
    return "Choose a PNG, JPG or WebP image."
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Choose an image under 10 MB."
  }
  return null
}

/** Shrinks the logo to fit 800×300, keeping its shape and transparency, as PNG. */
export async function toLogoImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(
    1,
    MAX_WIDTH / bitmap.width,
    MAX_HEIGHT / bitmap.height
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas isn't supported.")
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't read the image.")),
      "image/png"
    )
  )
}
