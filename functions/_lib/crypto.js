/**
 * Crypto utility for encrypting/decrypting tokens
 * Uses Web Crypto API (available in Cloudflare Workers)
 */

/**
 * Derive encryption key from passphrase
 * @param {string} passphrase - Secret passphrase from environment
 * @returns {Promise<CryptoKey>} Derived key for encryption/decryption
 */
async function deriveKey(passphrase) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('topflix-newsletter-salt'), // Fixed salt for consistent key
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string
 * @param {string} text - Text to encrypt (e.g., "email:timestamp")
 * @param {string} passphrase - Secret passphrase
 * @returns {Promise<string>} Base64-encoded encrypted string with IV
 */
export async function encrypt(text, passphrase) {
  const encoder = new TextEncoder();
  const key = await deriveKey(passphrase);

  // Generate random IV (Initialization Vector)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the text
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encoder.encode(text)
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Convert to base64 for URL-safe transmission
  return base64Encode(combined);
}

/**
 * Decrypt a string
 * @param {string} encryptedText - Base64-encoded encrypted string with IV
 * @param {string} passphrase - Secret passphrase
 * @returns {Promise<string>} Decrypted text
 */
export async function decrypt(encryptedText, passphrase) {
  const key = await deriveKey(passphrase);

  // Decode from base64
  const combined = base64Decode(encryptedText);

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  try {
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Failed to decrypt token. Token may be invalid or corrupted.');
  }
}

/**
 * Base64 encode (URL-safe)
 * @param {Uint8Array} buffer
 * @returns {string}
 */
function base64Encode(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 decode (URL-safe)
 * @param {string} base64
 * @returns {Uint8Array}
 */
function base64Decode(base64) {
  // Add padding if needed
  const padding = base64.length % 4;
  const padded = padding ? base64 + '='.repeat(4 - padding) : base64;

  const binary = atob(
    padded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
  );

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
