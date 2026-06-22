/**
 * supabase-to-backend-dry-run.test.ts — checks for the Phase 23 dry-run
 * helpers and report generation. No real Supabase/database access.
 *
 * Run: npx tsx scripts/migration/supabase-to-backend-dry-run.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyReservationStatus,
  detectSensitiveFieldNames,
  normalizeEmail,
  normalizePhone,
  parseSourceDate,
  parseSourceTime,
  safeCountRawPayloadPresence,
} from "./helpers";

async function main() {
  // normalizePhone
  assert.equal(normalizePhone(" +33 6 00 00 00 01 "), "+33600000001");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(123 as unknown), null, "non-string input is rejected");

  // normalizeEmail
  assert.equal(normalizeEmail(" Test@Example.com "), "test@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail(null), null);

  // parseSourceDate
  assert.equal(parseSourceDate("2025-05-01").valid, true);
  assert.equal(parseSourceDate("2025-05-01").isoDate, "2025-05-01");
  assert.equal(parseSourceDate(null).valid, false);
  assert.equal(parseSourceDate(null).reason, "missing");
  assert.equal(parseSourceDate("not-a-date").valid, false);
  assert.equal(parseSourceDate("not-a-date").reason, "invalid");
  assert.equal(parseSourceDate("2025-02-30").valid, false, "invalid calendar date is rejected");

  // parseSourceTime
  assert.equal(parseSourceTime("20:00").valid, true);
  assert.equal(parseSourceTime("20:00").normalized, "20:00");
  assert.equal(parseSourceTime("9:30").normalized, "09:30");
  assert.equal(parseSourceTime("").valid, false);
  assert.equal(parseSourceTime("").reason, "missing");
  assert.equal(parseSourceTime("25:99").valid, false);
  assert.equal(parseSourceTime("25:99").reason, "invalid");

  // detectSensitiveFieldNames
  assert.deepEqual(
    detectSensitiveFieldNames({ raw_payload: {}, customer_name: "Ada", phone_number: "123" }).sort(),
    ["phone_number", "raw_payload"]
  );
  assert.deepEqual(detectSensitiveFieldNames({ party_size: 2 }), []);
  assert.deepEqual(detectSensitiveFieldNames(null), []);

  // safeCountRawPayloadPresence
  assert.equal(safeCountRawPayloadPresence({ raw_payload: { a: 1 } }), 1);
  assert.equal(safeCountRawPayloadPresence({ raw_payload: null }), 0);
  assert.equal(safeCountRawPayloadPresence({ raw_payload: {}, response_payload: {} }), 2);
  assert.equal(safeCountRawPayloadPresence({}), 0);

  // classifyReservationStatus — unsupported statuses must never be guessed at.
  assert.equal(classifyReservationStatus("confirmed"), "confirmed");
  assert.equal(classifyReservationStatus("CONFIRMED"), "confirmed");
  assert.equal(classifyReservationStatus("seen"), "unsupported", "old `seen` status has no backend equivalent");
  assert.equal(classifyReservationStatus("totally-unknown"), "unsupported");
  assert.equal(classifyReservationStatus(null), "unsupported");

  // Report generation against a tiny fake local fixture (not the committed
  // sample-input — a throwaway temp dir to keep this test self-contained).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-dry-run-test-"));
  try {
    fs.writeFileSync(
      path.join(tmpDir, "customers.json"),
      JSON.stringify([
        { full_name: "Fixture One", phone_number: "+33600000099" },
        { full_name: "Fixture Two", phone_number: "+33 6 00 00 00 99" },
        { full_name: null, phone_number: null },
      ])
    );
    fs.writeFileSync(
      path.join(tmpDir, "reservation_requests.json"),
      JSON.stringify([
        { customer_name: "Fixture One", reservation_date: "2025-05-01", reservation_time: "20:00", status: "confirmed" },
        { customer_name: "Fixture Two", reservation_date: "bad", reservation_time: "bad", status: "seen" },
      ])
    );

    // dynamic import after fixtures exist so the script's own module-level
    // code (none currently) would see them if it had any.
    const { __buildReportForTest } = await import("./supabase-to-backend-dry-run");
    const report = __buildReportForTest(tmpDir);

    assert.equal(report.dryRun, true);
    assert.equal(report.writeEnabled, false);
    assert.equal(report.totals.sourceRecords, 5);
    assert.equal(report.totals.missingFiles, 6, "6 of the 8 supported files are absent in this fixture");
    assert.deepEqual(report.duplicateCandidates.phoneDuplicates, ["+33600000099"]);
    assert.equal(report.duplicateCandidates.missingContact, 1);
    assert.equal(report.unsupportedStatuses.length, 1);
    assert.equal(report.unsupportedStatuses[0].status, "seen");
    assert.ok(report.sensitivePayloadFieldsDetected.fieldNames.includes("phone_number"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("supabase-to-backend-dry-run.test.ts: all checks passed");
}

main().catch((err) => {
  console.error("supabase-to-backend-dry-run.test.ts failed:", err);
  process.exitCode = 1;
});
