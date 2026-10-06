// Turns a photo into a small JPEG "data:image/jpeg;base64,..." string for storing in the database.
// Phone photos are often 3–10 MB; shrinking to at most 1024 px keeps each one around 100–300 KB of text.

const MAX_CHARS = 2_500_000 // stay under the database limit (3,000,000) with room to spare

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file couldn't be opened as a picture."))
    }
    img.src = url
  })
}

function encode(img: HTMLImageElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process pictures.')
  ctx.fillStyle = '#ffffff' // transparent PNGs get a white background instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function photoToBase64(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a picture (JPG, PNG, …).')
  const img = await loadImage(file)
  // Try progressively smaller versions until it fits.
  for (const [side, q] of [[1024, 0.75], [800, 0.65], [600, 0.55]] as const) {
    const data = encode(img, side, q)
    if (data.length <= MAX_CHARS) return data
  }
  throw new Error('That picture is too large even after shrinking. Try another one.')
}
