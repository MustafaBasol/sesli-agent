/**
 * menuImportMarkdownSummary.ts — pure markdown summary generator for the
 * Phase 41 real-export dry-run review. No I/O, no database access, no
 * Supabase access. The JSON report remains the source of truth; this is a
 * human-readable companion only.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */
import type { MenuImportReport } from "./menuImportTypes";

function goNoGoRecommendation(report: MenuImportReport): "GO" | "NO-GO" {
  if (report.errors.length > 0) return "NO-GO";
  if (report.counts.categoriesRead === 0 || report.counts.itemsRead === 0) return "NO-GO";
  if (report.thresholdWarnings.length > 0) return "NO-GO";
  return "GO";
}

export function buildMarkdownSummary(report: MenuImportReport): string {
  const lines: string[] = [];

  lines.push("# Menu import dry-run report");
  lines.push("");
  lines.push(`- Run started at: ${report.runStartedAt}`);
  lines.push(`- Input directory: \`${report.inputDir}\``);
  lines.push(`- Target restaurant id: \`${report.targetRestaurantId}\``);
  lines.push(`- Dry run: ${report.dryRun}`);
  lines.push(`- Write enabled: ${report.writeEnabled}`);
  lines.push("");

  lines.push("## Counts");
  lines.push("");
  lines.push(`- Categories read: ${report.counts.categoriesRead}`);
  lines.push(`- Items read: ${report.counts.itemsRead}`);
  lines.push(`- Skipped categories: ${report.counts.skippedCategories}`);
  lines.push(`- Skipped items: ${report.counts.skippedItems}`);
  lines.push(`- Duplicate category names: ${report.counts.duplicateCategoryNames}`);
  lines.push(`- Duplicate item names: ${report.counts.duplicateItemNames}`);
  lines.push(`- Missing price: ${report.counts.missingPrice}`);
  lines.push(`- Invalid price: ${report.counts.invalidPrice}`);
  lines.push(`- Missing category: ${report.counts.missingCategory}`);
  lines.push(`- Orphan category references: ${report.counts.orphanCategoryReferences}`);
  lines.push("");

  lines.push("## Top warnings");
  lines.push("");
  if (report.warnings.length === 0) {
    lines.push("- (none)");
  } else {
    for (const warning of report.warnings.slice(0, 20)) {
      lines.push(`- ${warning}`);
    }
    if (report.warnings.length > 20) {
      lines.push(`- ...and ${report.warnings.length - 20} more (see the JSON report)`);
    }
  }
  lines.push("");

  lines.push("## Threshold warnings");
  lines.push("");
  if (report.thresholdWarnings.length === 0) {
    lines.push("- (none)");
  } else {
    for (const warning of report.thresholdWarnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push("");

  lines.push("## Go/no-go recommendation");
  lines.push("");
  lines.push(`**${goNoGoRecommendation(report)}**`);
  lines.push("");
  lines.push(
    "This is a non-binding suggestion derived from the counts above, not an approval. Production import is not approved by this report alone — see `docs/menu-data-migration-plan.md`."
  );
  lines.push("");

  return lines.join("\n");
}
