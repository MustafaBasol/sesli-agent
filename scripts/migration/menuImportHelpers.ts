/**
 * menuImportHelpers.ts — pure normalization/mapping helpers for the Phase 39
 * menu import dry-run. No I/O, no database access, no Supabase access.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */

export function normalizeMenuName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export type ParsedPrice = {
  cents: number | null;
  warning: "missing price" | "invalid price" | null;
};

/**
 * Parses a decimal string/number into integer cents without binary float
 * rounding. Accepts plain numbers, "12.50", "12,50" (comma decimal), and a
 * leading currency symbol/whitespace ("€12.50"). Anything that doesn't
 * resolve to a clean `-?digits(.digits{1,2})?` value is reported invalid
 * rather than guessed at.
 */
export function parsePriceToCents(value: unknown): ParsedPrice {
  if (value === null || value === undefined || value === "") {
    return { cents: null, warning: "missing price" };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { cents: null, warning: "invalid price" };
    return { cents: Math.round(value * 100), warning: null };
  }

  if (typeof value !== "string") {
    return { cents: null, warning: "invalid price" };
  }

  let cleaned = value.trim().replace(/[^0-9,.\-]/g, "");
  if (!cleaned) return { cents: null, warning: "invalid price" };

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { cents: null, warning: "invalid price" };
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [intPart, decPart = ""] = unsigned.split(".");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0").slice(0, 2));
  return { cents: negative ? -cents : cents, warning: null };
}

export function toBoundedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  return strings.length > 0 ? strings : undefined;
}

const FALSY_AVAILABILITY_STATUSES = new Set(["inactive", "unavailable", "out_of_stock", "disabled", "archived"]);

export function mapIsAvailable(record: Record<string, unknown>): boolean {
  const raw = record.is_available ?? record.isAvailable ?? record.available;
  if (typeof raw === "boolean") return raw;
  const status = record.status;
  if (typeof status === "string" && FALSY_AVAILABILITY_STATUSES.has(status.trim().toLowerCase())) {
    return false;
  }
  return true;
}

const ACTIVE_STATUS_FIELDS = ["status", "is_active", "isActive", "active"] as const;

export function mapStatus(record: Record<string, unknown>): "active" | "inactive" {
  for (const field of ACTIVE_STATUS_FIELDS) {
    const raw = record[field];
    if (typeof raw === "boolean") return raw ? "active" : "inactive";
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (normalized === "inactive" || normalized === "archived" || normalized === "disabled") return "inactive";
      if (normalized === "active") return "active";
    }
  }
  return "active";
}

export function readSortOrder(record: Record<string, unknown>): number {
  const raw = record.sort_order ?? record.sortOrder ?? record.display_order ?? record.displayOrder;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readSourceId(record: Record<string, unknown>): string | number | null {
  const raw = record.id;
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}

export function readCategoryReference(record: Record<string, unknown>): string | number | null {
  const raw = record.category_id ?? record.categoryId ?? record.category_name ?? record.category;
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return null;
}
