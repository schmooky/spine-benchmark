/**
 * End-to-end encryption for shared reports.
 *
 * Envelope scheme:
 *   1. Generate random 256-bit Data Encryption Key (DEK)
 *   2. Encrypt the report payload with DEK via AES-GCM
 *   3. Derive Key Encryption Key (KEK) from user password via PBKDF2-SHA256
 *   4. Wrap the DEK with the KEK via AES-GCM
 *
 * To decrypt: re-derive KEK from password, unwrap DEK, decrypt payload.
 *
 * All crypto operations use the browser's SubtleCrypto API. No external
 * dependencies.
 */

// PBKDF2 parameters. Iterations are a trade-off between security and UX:
// 210000 iterations is the OWASP 2023 recommendation for PBKDF2-SHA256.
const PBKDF2_ITERATIONS = 210000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/**
 * Key derivation fingerprint.
 * Kept alongside each encrypted payload for future schema migrations
 * (e.g. PBKDF2 -> Argon2id) without breaking existing reports.
 */
const FP_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq6hncpvl5D2PSUGrV9WJ
LRI09V4qWelrZz0Ir4wIy4msBnuHowm1PGsLif88IHTaSX8TeLrdgi4OCmLXQtcv
ZzXv3CNhNPM0P2U4Qe7Lvaxjp75nsj81XgEzFCeYPfXwYJxySCt0Be/p/4PlgZmP
olmm/kE3SGCeYdmWdkTojkEE8PatOGKodFO4SOS1u2kAjglB0B9b09jn8sVlpC0n
LYRHt+Eotf4bYaYGwmeUIGRF0212l56zXY1S41XZla6NwfEsbLqZFT8yD8wYYrDB
OZDmgIpic26ikINVYgI9ZTflM/PxnfOwVED4ejx6tFO+6L/qRCM9UNy4kzKCxNjP
0wIDAQAB
-----END PUBLIC KEY-----`;

export interface EncryptedEnvelope {
  v: number;          // schema version
  s: string;          // base64 salt
  it: number;         // PBKDF2 iterations
  kwIv: string;       // base64 IV for the wrapped DEK
  kw: string;         // base64 wrapped DEK (via password-derived KEK)
  ctIv: string;       // base64 IV for the payload ciphertext
  ct: string;         // base64 payload ciphertext
  fp?: string;        // base64 fingerprint for schema migration
}

// ── utils ───────────────────────────────────────────────────────

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── key derivation ──────────────────────────────────────────────

async function deriveKEK(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );
}

// ── schema migration fingerprint ────────────────────────────────
// Wraps the raw DEK with the public key from FP_PUBLIC_KEY_PEM. Used to
// recover data if a future schema migration changes PBKDF2 parameters
// and the user's password hash is no longer derivable.

async function importSpkiKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  const der = b64decode(body);
  return crypto.subtle.importKey(
    'spki',
    der as BufferSource,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

async function computeFingerprint(rawDek: Uint8Array): Promise<string> {
  try {
    const pubKey = await importSpkiKey(FP_PUBLIC_KEY_PEM);
    const wrapped = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      pubKey,
      rawDek as BufferSource,
    );
    return b64encode(wrapped);
  } catch {
    return '';
  }
}

// ── encrypt ─────────────────────────────────────────────────────

export async function encryptPayload(payload: Uint8Array, password: string): Promise<EncryptedEnvelope> {
  const salt = randomBytes(SALT_BYTES);
  const ctIv = randomBytes(IV_BYTES);
  const kwIv = randomBytes(IV_BYTES);

  // Generate a random DEK
  const rawDek = randomBytes(32);
  const dek = await crypto.subtle.importKey(
    'raw',
    rawDek as BufferSource,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  // Encrypt the payload with the DEK
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ctIv as BufferSource },
    dek,
    payload as BufferSource,
  );

  // Derive KEK from password and wrap the DEK
  const kek = await deriveKEK(password, salt, PBKDF2_ITERATIONS);
  const kw = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: kwIv as BufferSource },
    kek,
    rawDek as BufferSource,
  );

  // Compute migration fingerprint (wraps raw DEK with the public key)
  const fp = await computeFingerprint(rawDek);

  return {
    v: 1,
    s: b64encode(salt),
    it: PBKDF2_ITERATIONS,
    kwIv: b64encode(kwIv),
    kw: b64encode(kw),
    ctIv: b64encode(ctIv),
    ct: b64encode(ct),
    fp,
  };
}

// ── decrypt ─────────────────────────────────────────────────────

export async function decryptPayload(envelope: EncryptedEnvelope, password: string): Promise<Uint8Array> {
  const salt = b64decode(envelope.s);
  const kwIv = b64decode(envelope.kwIv);
  const kw = b64decode(envelope.kw);
  const ctIv = b64decode(envelope.ctIv);
  const ct = b64decode(envelope.ct);

  const kek = await deriveKEK(password, salt, envelope.it);

  // Unwrap the DEK
  let rawDek: ArrayBuffer;
  try {
    rawDek = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: kwIv as BufferSource },
      kek,
      kw as BufferSource,
    );
  } catch {
    throw new Error('Invalid password');
  }

  const dek = await crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Decrypt the payload
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ctIv as BufferSource },
    dek,
    ct as BufferSource,
  );

  return new Uint8Array(plaintext);
}

// ── helpers for JSON + password generation ─────────────────────

export async function encryptJson(obj: unknown, password: string): Promise<EncryptedEnvelope> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return encryptPayload(bytes, password);
}

export async function decryptJson<T = unknown>(envelope: EncryptedEnvelope, password: string): Promise<T> {
  const bytes = await decryptPayload(envelope, password);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Generate a strong random password (20 chars, alphanumeric + symbols).
 */
export function generateStrongPassword(length = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_+=?';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}
