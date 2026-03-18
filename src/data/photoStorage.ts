import { supabase, supabasePhotosBucket } from './supabase'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await fileToImageBitmap(file)
  const maxDimension = 768
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    throw new Error('Unable to compress image.')
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.82)
  })

  if (!blob) {
    throw new Error('Unable to encode compressed image.')
  }

  return blob
}

export async function uploadCompressedPersonPhoto(
  treeId: string,
  personId: string,
  file: File,
): Promise<string> {
  const client = requireSupabase()
  const compressed = await compressImage(file)
  const path = `${treeId}/${personId}.webp`

  const { error } = await client.storage.from(supabasePhotosBucket).upload(path, compressed, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  })

  if (error) {
    throw error
  }

  const { data } = client.storage.from(supabasePhotosBucket).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
