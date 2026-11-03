/**
 * AES-GCM encryption for integration secrets (Picnic auth keys). The key comes from the
 * PICNIC_TOKEN_ENCRYPTION_KEY Worker secret (32 random bytes, base64). Ciphertexts are bound to the
 * user id through additional authenticated data, so a row copied to another user cannot be decrypted.
 */

function fromBase64(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Encryption key is not configured.');
  }
}

async function importKey(secret: string | undefined) {
  if (!secret) throw new EncryptionUnavailableError();
  const raw = fromBase64(secret.trim());
  if (raw.length !== 32) throw new EncryptionUnavailableError();
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(plaintext: string, secret: string | undefined, context: string) {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

export async function decryptSecret(ciphertext: string, iv: string, secret: string | undefined, context: string) {
  const key = await importKey(secret);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) }, key, fromBase64(ciphertext));
  return new TextDecoder().decode(plaintext);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function encryptionConfigured(secret: string | undefined) {
  if (!secret) return false;
  try {
    return fromBase64(secret.trim()).length === 32;
  } catch {
    return false;
  }
}
