import type { GraphSchema } from '../domain/graph'

const BACKUP_VERSION = 1
const PBKDF2_ITERATIONS = 250_000
const AES_KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12

export type EncryptedBackupFile = {
  version: number
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  cipher: {
    name: 'AES-GCM'
    iv: string
  }
  ciphertext: string
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedBackupFile(value: unknown): value is EncryptedBackupFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<EncryptedBackupFile>
  return (
    candidate.version === BACKUP_VERSION &&
    candidate.kdf?.name === 'PBKDF2' &&
    candidate.kdf?.hash === 'SHA-256' &&
    typeof candidate.kdf?.iterations === 'number' &&
    typeof candidate.kdf?.salt === 'string' &&
    candidate.cipher?.name === 'AES-GCM' &&
    typeof candidate.cipher?.iv === 'string' &&
    typeof candidate.ciphertext === 'string'
  )
}

export async function encryptGraphBackup(
  graph: GraphSchema,
  passphrase: string,
): Promise<EncryptedBackupFile> {
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(graph))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintext,
  )

  return {
    version: BACKUP_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: uint8ArrayToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: uint8ArrayToBase64(iv),
    },
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptGraphBackup(
  payload: EncryptedBackupFile,
  passphrase: string,
): Promise<GraphSchema> {
  const key = await deriveKey(
    passphrase,
    base64ToUint8Array(payload.kdf.salt),
    payload.kdf.iterations,
  )

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64ToUint8Array(payload.cipher.iv)),
    },
    key,
    toArrayBuffer(base64ToUint8Array(payload.ciphertext)),
  )

  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(plaintext)) as GraphSchema
}
