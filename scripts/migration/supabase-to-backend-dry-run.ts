/**
 * supabase-to-backend-dry-run.ts — Phase 23 dry-run import skeleton.
 *
 * This script is READ-ONLY. It does not connect to Supabase, does not write
 * to the backend database, and does not perform a real migration. It reads
 * local JSON export files from a directory and produces a migration report
 * describing what a future write migration *would* do.
 *
 * Policy reference: docs/migration-policy.md
 * Run: npx tsx scripts/migration/supabase-to-backend-dry-run.ts
 */
import fs from "node:fs";
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

const SUPPORTED_SOURCE_FILES = [
  "customers.json",
  "tables.json",
  "reservation_requests.json",
  "reservations.json",
  "calls.json",
  "tool_logs.json",
  "staff_handoffs.json",
  "restaurant_settings.json",
] as const;

const DEFERRED_SOURCE_FILES = ["menu_items.json", "menu_categories.json", "orders.json", "blackout_dates.json", "restaurant_rules.json"];

type TableSummary = {
  file: string;
  found: boolean;
  recordCount: number;
  warnings: string[];
};

export type MigrationReport = {
  runStartedAt: string;
  sourceDir: string;
  dryRun: true;
  writeEnabled: false;
  tables: TableSummary[];
  totals: { sourceRecords: number; missingFiles: number };
  warnings: string[];
  blockers: string[];
  duplicateCandidates: { phoneDuplicates: string[]; emailDuplicates: string[]; missingContact: number };
  unsupportedStatuses: { recordIndex: number; status: unknown }[];
  missingRequiredFields: { file: string; recordIndex: number; field: string }[];
  sensitivePayloadFieldsDetected: { file: string; fieldNames: string[]; rawPayloadPresentCount: number };
  recommendedNextActions: string[];
};

function readJsonArray(filePath: string): unknown[] | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function __buildReportForTest(sourceDir: string): MigrationReport {
  return buildReport(sourceDir);
}

function buildReport(sourceDir: string): MigrationReport {
  const report: MigrationReport = {
    runStartedAt: new Date().toISOString(),
    sourceDir,
    dryRun: true,
    writeEnabled: false,
    tables: [],
    totals: { sourceRecords: 0, missingFiles: 0 },
    warnings: [],
    blockers: [],
    duplicateCandidates: { phoneDuplicates: [], emailDuplicates: [], missingContact: 0 },
    unsupportedStatuses: [],
    missingRequiredFields: [],
    sensitivePayloadFieldsDetected: { fieldNames: [], rawPayloadPresentCount: 0, file: "" },
    recommendedNextActions: [],
  };

  const sensitiveFieldNameSet = new Set<string>();
  let rawPayloadPresentCount = 0;
  const phoneSeen = new Map<string, number>();
  const emailSeen = new Map<string, number>();

  for (const file of SUPPORTED_SOURCE_FILES) {
    const filePath = path.join(sourceDir, file);
    const records = readJsonArray(filePath);
    const tableWarnings: string[] = [];

    if (records === null) {
      report.tables.push({ file, found: false, recordCount: 0, warnings: ["file not found, skipped"] });
      report.totals.missingFiles += 1;
      continue;
    }

    records.forEach((record, index) => {
      if (typeof record !== "object" || record === null) {
        tableWarnings.push(`record ${index}: not an object, skipped`);
        return;
      }
      const obj = record as Record<string, unknown>;

      for (const fieldName of detectSensitiveFieldNames(obj)) {
        sensitiveFieldNameSet.add(fieldName);
      }
      rawPayloadPresentCount += safeCountRawPayloadPresence(obj);

      if (file === "customers.json") {
        const phone = normalizePhone(obj.phone_number ?? obj.phoneNumber);
        const email = normalizeEmail(obj.email);
        if (!phone && !email) {
          report.duplicateCandidates.missingContact += 1;
        }
        if (phone) phoneSeen.set(phone, (phoneSeen.get(phone) ?? 0) + 1);
        if (email) emailSeen.set(email, (emailSeen.get(email) ?? 0) + 1);
        if (!obj.full_name && !obj.fullName) {
          report.missingRequiredFields.push({ file, recordIndex: index, field: "full_name" });
        }
      }

      if (file === "reservation_requests.json" || file === "reservations.json") {
        const status = classifyReservationStatus(obj.status);
        if (status === "unsupported") {
          report.unsupportedStatuses.push({ recordIndex: index, status: obj.status });
        }
        const dateResult = parseSourceDate(obj.reservation_date ?? obj.reservationDate);
        if (!dateResult.valid) {
          tableWarnings.push(`record ${index}: ${dateResult.reason ?? "invalid"} reservation date`);
        }
        const timeResult = parseSourceTime(obj.reservation_time ?? obj.reservationTime);
        if (!timeResult.valid) {
          tableWarnings.push(`record ${index}: ${timeResult.reason ?? "invalid"} reservation time`);
        }
        if (!obj.customer_name && !obj.customerName) {
          report.missingRequiredFields.push({ file, recordIndex: index, field: "customer_name" });
        }
      }
    });

    report.tables.push({ file, found: true, recordCount: records.length, warnings: tableWarnings });
    report.totals.sourceRecords += records.length;
    report.warnings.push(...tableWarnings.map((w) => `${file}: ${w}`));
  }

  for (const file of DEFERRED_SOURCE_FILES) {
    const filePath = path.join(sourceDir, file);
    if (fs.existsSync(filePath)) {
      report.warnings.push(`${file}: present but deferred — no backend destination in this phase (see docs/migration-policy.md §G)`);
    }
  }

  report.duplicateCandidates.phoneDuplicates = [...phoneSeen.entries()].filter(([, count]) => count > 1).map(([phone]) => phone);
  report.duplicateCandidates.emailDuplicates = [...emailSeen.entries()].filter(([, count]) => count > 1).map(([email]) => email);

  report.sensitivePayloadFieldsDetected = {
    file: "all",
    fieldNames: [...sensitiveFieldNameSet].sort(),
    rawPayloadPresentCount,
  };

  if (report.totals.sourceRecords === 0) {
    report.blockers.push("no source records found in any supported input file — nothing to report on");
  }
  if (report.unsupportedStatuses.length > 0) {
    report.warnings.push(`${report.unsupportedStatuses.length} reservation record(s) have an unsupported legacy status — see docs/migration-policy.md §E`);
  }

  report.recommendedNextActions.push(
    "review duplicateCandidates before any customer write migration is attempted",
    "review unsupportedStatuses before any reservation write migration is attempted",
    "do not enable MIGRATION_WRITE_ENABLED — no write path exists yet in this phase"
  );

  return report;
}

function printUsageAndExit(): never {
  console.log(
    [
      "supabase-to-backend-dry-run.ts — read-only dry-run report generator.",
      "",
      "Usage:",
      "  MIGRATION_SOURCE_DIR=./scripts/migration/sample-input npx tsx scripts/migration/supabase-to-backend-dry-run.ts",
      "",
      "No MIGRATION_SOURCE_DIR was provided, or the directory does not exist.",
      "This script never connects to Supabase and never writes to any database.",
    ].join("\n")
  );
  process.exit(0);
}

function main() {
  const sourceDir = process.env.MIGRATION_SOURCE_DIR;
  if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    printUsageAndExit();
  }

  if (process.env.MIGRATION_WRITE_ENABLED === "true") {
    console.warn("MIGRATION_WRITE_ENABLED=true was set, but no write path exists in this phase — continuing in dry-run mode only.");
  }

  const report = buildReport(sourceDir as string);
  console.log(JSON.stringify(report, null, 2));

  const outputDir = process.env.MIGRATION_OUTPUT_DIR;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `dry-run-report-${Date.now()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\nReport also written to: ${outputPath}`);
  }
}

if (require.main === module) {
  main();
}
