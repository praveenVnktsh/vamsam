import { supabase, supabasePhotosBucket } from './supabase'

export type PhotoCrop = {
  centerX: number
  centerY: number
  zoom: number
}

const PHOTO_MAX_BYTES = 50 * 1024
const PHOTO_MAX_DIMENSION = 256
const PHOTO_MIN_DIMENSION = 160
const PHOTO_INITIAL_QUALITY = 0.82
const PHOTO_MIN_QUALITY = 0.46
const PHOTO_QUALITY_STEP = 0.08
const SIGNED_URL_TTL_SECONDS = 60 * 60
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  return supabase
}

function buildPhotoStorageRef(bucket: string, path: string) {
  return `storage://${bucket}/${path}?v=${Date.now()}`
}

function parsePhotoStorageRef(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^storage:\/\/([^/]+)\/([^?]+)(?:\?(.*))?$/)
  if (!match) return null

  return {
    bucket: match[1],
    path: match[2],
    version: match[3] ?? '',
  }
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

function drawScaledBitmap(bitmap: ImageBitmap, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to compress image.')
  }

  context.drawImage(bitmap, 0, 0, size, size)
  return canvas
}

async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })

  if (!blob) {
    throw new Error('Unable to encode compressed image.')
  }

  return blob
}

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await fileToImageBitmap(file)

  try {
    let size = Math.min(PHOTO_MAX_DIMENSION, bitmap.width, bitmap.height)
    while (size >= PHOTO_MIN_DIMENSION) {
      const canvas = drawScaledBitmap(bitmap, size)
      for (
        let quality = PHOTO_INITIAL_QUALITY;
        quality >= PHOTO_MIN_QUALITY;
        quality -= PHOTO_QUALITY_STEP
      ) {
        const blob = await encodeCanvas(canvas, Number(quality.toFixed(2)))
        if (blob.size <= PHOTO_MAX_BYTES) {
          return blob
        }
      }
      size = Math.floor(size * 0.82)
    }

    const fallbackCanvas = drawScaledBitmap(bitmap, PHOTO_MIN_DIMENSION)
    const fallbackBlob = await encodeCanvas(fallbackCanvas, PHOTO_MIN_QUALITY)
    if (fallbackBlob.size > PHOTO_MAX_BYTES) {
      throw new Error('Unable to compress image under 50 KB. Try a tighter crop.')
    }
    return fallbackBlob
  } finally {
    bitmap.close()
  }
}

export async function cropImageFile(file: File, crop: PhotoCrop): Promise<File> {
  const bitmap = await fileToImageBitmap(file)
  const sourceCropSize = Math.max(1, Math.round(Math.min(bitmap.width, bitmap.height) / crop.zoom))
  const centerX = bitmap.width * crop.centerX
  const centerY = bitmap.height * crop.centerY
  const sourceX = Math.max(
    0,
    Math.min(bitmap.width - sourceCropSize, Math.round(centerX - sourceCropSize / 2)),
  )
  const sourceY = Math.max(
    0,
    Math.min(bitmap.height - sourceCropSize, Math.round(centerY - sourceCropSize / 2)),
  )
  const outputSize = Math.min(PHOTO_MAX_DIMENSION * 2, sourceCropSize)

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Unable to crop image.')
  }

  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceCropSize,
    sourceCropSize,
    0,
    0,
    outputSize,
    outputSize,
  )
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png', 0.92)
  })

  if (!blob) {
    throw new Error('Unable to prepare cropped image.')
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}-cropped.png`, { type: 'image/png' })
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

  return buildPhotoStorageRef(supabasePhotosBucket, path)
}

export function isStoredPhotoRef(value: string) {
  return Boolean(parsePhotoStorageRef(value))
}

export async function resolvePhotoUrl(value: string): Promise<string> {
  const parsed = parsePhotoStorageRef(value)
  if (!parsed) {
    return value.trim()
  }

  const cacheKey = `${parsed.bucket}/${parsed.path}?${parsed.version}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url
  }

  const client = requireSupabase()
  const { data, error } = await client.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Unable to resolve signed photo URL.')
  }

  const signedUrl = parsed.version
    ? `${data.signedUrl}&${parsed.version}`
    : data.signedUrl
  signedUrlCache.set(cacheKey, {
    url: signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_TTL_SECONDS - 60) * 1000,
  })

  return signedUrl
}
