/**
 * encryption.ts — AES-256-GCM symmetric encryption for integration credentials at rest.
 *
 * Adapted from the Dental CRM project's WhatsApp connection encryption utility
 * (server/src/utils/encryption.ts) — same algorithm and encoded format, renamed
 * env var to scope it to this project's IntegrationConnection.credentialsEncrypted.
 *
 * Required env var:
 *   INTEGRATION_CREDENTIALS_ENCRYPTION_KEY=<64 hex chars, 32 bytes>
 *   Generate with: openssl rand -hex 32
 *
 * Encoded format (all hex): iv(24) + authTag(32) + ciphertext
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_HEX_LENGTH = 64; // 32 bytes

function getKey(): Buffer {
  const hex = process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY env var must be a ${KEY_HEX_LENGTH}-char hex string (32 bytes). ` +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

/** Returns true if INTEGRATION_CREDENTIALS_ENCRYPTION_KEY is set and well-formed. */
export function isCredentialEncryptionConfigured(): boolean {
  const hex = process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY;
  return Boolean(hex && hex.length === KEY_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(hex));
}

/** Encrypts a plaintext string. Returns a hex-encoded string: iv(24) + authTag(32) + ciphertext. */
export function encryptCredentials(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + tag.toString("hex") + encrypted.toString("hex");
}

/** Decrypts a ciphertext produced by encryptCredentials(). Throws if malformed or the key is wrong. */
export function decryptCredentials(ciphertext: string): string {
  const key = getKey();
  const iv = Buffer.from(ciphertext.slice(0, 24), "hex");
  const tag = Buffer.from(ciphertext.slice(24, 56), "hex");
  const data = Buffer.from(ciphertext.slice(56), "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString("utf8") + decipher.final("utf8");
}
