/**
 * Phase 38 — pure helpers for the get-menu-info Vapi adapter. Same pattern as
 * checkAvailabilityAdapter.ts / customerProfileAdapter.ts: no Prisma, no
 * Express — argument extraction, limit/price normalization, and
 * response-shape building only, so it is unit-testable without a database.
 * The route in routes/webhooks/vapi.ts owns tenant resolution, Prisma reads,
 * and ToolLog writes.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Prisma } from "@prisma/client";
import { getValueFromAliases } from "./normalizers";
import { getVapiToolCallId } from "./toolResponse";

const CATEGORY_ALIASES = ["category", "categoryName", "category_name"];
const SEARCH_ALIASES = ["search", "query", "keyword", "itemName", "item_name"];
const LIMIT_ALIASES = ["limit", "maxItems", "max_items"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];
const CALL_ID_ALIASES = ["callId", "call_id", "conversationId", "vapiCallId", "id", "toolCallId"];

export const DEFAULT_MENU_ITEMS_LIMIT = 10;
export const MAX_MENU_ITEMS_LIMIT = 12;

function extractCallId(sources: any[], rawBody: any): string | null {
  return getValueFromAliases(sources, CALL_ID_ALIASES) || getVapiToolCallId(rawBody);
}

/** Bounds a caller-supplied limit to a sane voice-response size; unparseable/missing values fall back to the default. */
export function normalizeMenuItemsLimit(value: any): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MENU_ITEMS_LIMIT;
  return Math.min(parsed, MAX_MENU_ITEMS_LIMIT);
}

export interface VapiGetMenuInfoArgs {
  category: string | null;
  search: string | null;
  limit: number;
  language: string | null;
  callId: string | null;
}

export function extractGetMenuInfoArgs(sources: any[], rawBody: any): VapiGetMenuInfoArgs {
  return {
    category: getValueFromAliases(sources, CATEGORY_ALIASES) || null,
    search: getValueFromAliases(sources, SEARCH_ALIASES) || null,
    limit: normalizeMenuItemsLimit(getValueFromAliases(sources, LIMIT_ALIASES)),
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    callId: extractCallId(sources, rawBody),
  };
}

/** Formats a deterministic, voice-friendly price string; omits entirely when no price is on file rather than inventing one. */
export function formatMenuPrice(priceCents: number | null, currency: string | null | undefined): string | undefined {
  if (priceCents === null || priceCents === undefined) return undefined;
  const amount = (priceCents / 100).toFixed(2);
  return `${amount} ${currency && currency.trim() ? currency : "EUR"}`;
}

function toStringArrayOrUndefined(value: Prisma.JsonValue | null | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export interface VapiMenuItemSummary {
  name: string;
  category?: string;
  description?: string;
  price?: string;
  dietary_tags?: string[];
  allergens?: string[];
}

interface MenuItemRowLike {
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  allergensJson: Prisma.JsonValue;
  dietaryTagsJson: Prisma.JsonValue;
}

/** Maps a MenuItem row to the curated, allowlisted shape returned to Vapi — never the raw Prisma row. */
export function toVoiceMenuItemSummary(item: MenuItemRowLike, categoryName?: string | null): VapiMenuItemSummary {
  const price = formatMenuPrice(item.priceCents, item.currency);
  const dietaryTags = toStringArrayOrUndefined(item.dietaryTagsJson);
  const allergens = toStringArrayOrUndefined(item.allergensJson);

  return {
    name: item.name,
    ...(categoryName ? { category: categoryName } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(price ? { price } : {}),
    ...(dietaryTags ? { dietary_tags: dietaryTags } : {}),
    ...(allergens ? { allergens } : {}),
  };
}

export interface VapiMenuCategorySummary {
  name: string;
  description?: string;
}

interface MenuCategoryRowLike {
  name: string;
  description: string | null;
}

export function toVoiceMenuCategorySummary(category: MenuCategoryRowLike): VapiMenuCategorySummary {
  return {
    name: category.name,
    ...(category.description ? { description: category.description } : {}),
  };
}

export interface VapiMenuInfoResponse {
  success: boolean;
  message: string;
  menu_available?: boolean;
  items_found?: boolean;
  category?: string;
  categories?: VapiMenuCategorySummary[];
  items?: VapiMenuItemSummary[];
}

export function buildNoMenuConfiguredResponse(): VapiMenuInfoResponse {
  return {
    success: true,
    menu_available: false,
    message: "The menu has not been configured in the backend yet.",
  };
}

export function buildNoMatchingMenuItemsResponse(filter?: { category?: string | null; search?: string | null }): VapiMenuInfoResponse {
  const category = filter?.category ?? undefined;
  const search = filter?.search ?? undefined;
  const message = category
    ? `I couldn't find any available items in the "${category}" category.`
    : search
      ? `I couldn't find any menu items matching "${search}".`
      : "I couldn't find any available menu items right now.";
  return {
    success: true,
    items_found: false,
    ...(category ? { category } : {}),
    message,
  };
}

function summarizeItemNames(items: VapiMenuItemSummary[]): string {
  return items
    .map((item) => (item.price ? `${item.name} (${item.price})` : item.name))
    .join(", ");
}

export function buildMenuSummaryResponse(
  categories: VapiMenuCategorySummary[],
  items: VapiMenuItemSummary[]
): VapiMenuInfoResponse {
  const categoryNames = categories.map((c) => c.name).join(", ");
  const itemsList = items.length > 0 ? summarizeItemNames(items) : null;

  let message: string;
  if (categories.length > 0 && itemsList) {
    message = `We have the following categories: ${categoryNames}. Some items include: ${itemsList}.`;
  } else if (categories.length > 0) {
    message = `We have the following categories: ${categoryNames}. Please ask about a specific item or category for more details.`;
  } else if (itemsList) {
    message = `Some items on our menu include: ${itemsList}.`;
  } else {
    message = "Our menu is configured but no items are currently available.";
  }

  return {
    success: true,
    menu_available: true,
    ...(categories.length > 0 ? { categories } : {}),
    ...(items.length > 0 ? { items } : {}),
    message,
  };
}

export function buildFilteredMenuItemsResponse(
  items: VapiMenuItemSummary[],
  filter: { category?: string | null; search?: string | null }
): VapiMenuInfoResponse {
  const itemsList = summarizeItemNames(items);
  const message = filter.category
    ? `Here are some items in ${filter.category}: ${itemsList}.`
    : `Here is what I found for "${filter.search}": ${itemsList}.`;

  return {
    success: true,
    items_found: true,
    ...(filter.category ? { category: filter.category } : {}),
    items,
    message,
  };
}
