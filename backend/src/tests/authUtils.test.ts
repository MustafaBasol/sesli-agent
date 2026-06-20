/**
 * authUtils.test.ts — password hashing and JWT round-trip checks.
 *
 * Run: npx tsx src/tests/authUtils.test.ts
 */
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../utils/password";
import { signAuthToken, verifyAuthToken } from "../utils/jwt";

async function main() {
  // Password hashing round-trip and rejection of wrong passwords.
  const hash = await hashPassword("correct-horse-battery-staple");
  assert.ok(await verifyPassword("correct-horse-battery-staple", hash), "correct password should verify");
  assert.ok(!(await verifyPassword("wrong-password", hash)), "wrong password must not verify");
  assert.notEqual(hash, "correct-horse-battery-staple", "hash must not store the plaintext");

  // JWT round-trip and tampering rejection.
  const token = signAuthToken({ sub: "user-123" });
  const decoded = verifyAuthToken(token);
  assert.equal(decoded.sub, "user-123", "decoded subject must match signed subject");

  assert.throws(() => verifyAuthToken(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")), "tampered token must fail verification");

  console.log("authUtils.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("authUtils.test.ts failed:", err);
  process.exitCode = 1;
});
