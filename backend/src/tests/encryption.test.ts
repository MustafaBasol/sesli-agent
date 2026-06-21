/**
 * encryption.test.ts — AES-256-GCM round-trip and failure-mode checks for
 * integration credential encryption.
 *
 * Run: npx tsx src/tests/encryption.test.ts
 */
import assert from "node:assert/strict";

async function main() {
  // 1. Missing key -> isCredentialEncryptionConfigured() is false and
  //    encrypt/decrypt fail safely instead of silently storing plaintext.
  delete process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY;
  const { encryptCredentials, decryptCredentials, isCredentialEncryptionConfigured } = await import("../utils/encryption");

  assert.equal(isCredentialEncryptionConfigured(), false, "unset key must report as not configured");
  assert.throws(() => encryptCredentials("secret"), "encrypting without a key must throw, never fall back to plaintext");

  // 2. Valid key -> round-trip works and ciphertext never contains the plaintext.
  process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  assert.equal(isCredentialEncryptionConfigured(), true);

  const plaintext = JSON.stringify({ apiKey: "sk_live_super_secret_value" });
  const ciphertext = encryptCredentials(plaintext);
  assert.notEqual(ciphertext, plaintext);
  assert.ok(!ciphertext.includes("super_secret_value"), "ciphertext must not leak the plaintext secret");
  assert.equal(decryptCredentials(ciphertext), plaintext, "decrypted value must match the original plaintext");

  // 3. Tampered ciphertext must fail authentication (GCM auth tag), not
  //    silently decrypt to garbage.
  const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith("00") ? "ff" : "00");
  assert.throws(() => decryptCredentials(tampered), "tampered ciphertext must fail GCM auth tag verification");

  // 4. Malformed/short key -> rejected rather than silently truncated/padded.
  process.env.INTEGRATION_CREDENTIALS_ENCRYPTION_KEY = "not-hex-and-too-short";
  assert.equal(isCredentialEncryptionConfigured(), false);
  assert.throws(() => encryptCredentials("secret"));

  console.log("encryption.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("encryption.test.ts failed:", err);
  process.exitCode = 1;
});
