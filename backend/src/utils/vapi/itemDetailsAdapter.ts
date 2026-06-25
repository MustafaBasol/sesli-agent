/**
 * Phase 38 — pure helpers for the get-item-details Vapi adapter. Same pattern
 * as menuInfoAdapter.ts / customerProfileAdapter.ts: no Prisma, no Express —
 * argument extraction, missing-field policy, and response-shape building
 * only, so it is unit-testable without a database. The route in
 * routes/webhooks/vapi.ts owns tenant resolution, the tiered name search
 * (exact/alias/contains), and ToolLog writes.
 *
 * Source objects come straight from Vapi's dynamic JSON payloads, so `any`
 * is used deliberately for them rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getValueFromAliases } from "./normalizers";
import { getVapiToolCallId } from "./toolResponse";
import { formatMenuPrice } from "./menuInfoAdapter";
import type { Prisma } from "@prisma/client";

const ITEM_ID_ALIASES = ["itemId", "item_id"];
const ITEM_NAME_ALIASES = ["itemName", "item_name", "name"];
const SEARCH_ALIASES = ["search", "query", "keyword"];
const CATEGORY_ALIASES = ["category", "categoryName", "category_name"];
const LANGUAGE_ALIASES = ["language", "lang", "locale"];
const CALL_ID_ALIASES = ["callId", "call_id", "conversationId", "vapiCallId", "id", "toolCallId"];

export const MAX_CANDIDATES = 5;

function extractCallId(sources: any[], rawBody: any): string | null {
  return getValueFromAliases(sources, CALL_ID_ALIASES) || getVapiToolCallId(rawBody);
}

export interface VapiGetItemDetailsArgs {
  itemId: string | null;
  itemName: string | null;
  search: string | null;
  category: string | null;
  language: string | null;
  callId: string | null;
}

export function extractGetItemDetailsArgs(sources: any[], rawBody: any): VapiGetItemDetailsArgs {
  return {
    itemId: getValueFromAliases(sources, ITEM_ID_ALIASES) || null,
    itemName: getValueFromAliases(sources, ITEM_NAME_ALIASES) || null,
    search: getValueFromAliases(sources, SEARCH_ALIASES) || null,
    category: getValueFromAliases(sources, CATEGORY_ALIASES) || null,
    language: getValueFromAliases(sources, LANGUAGE_ALIASES) || null,
    callId: extractCallId(sources, rawBody),
  };
}

/** Required-field policy: at least one of itemId, itemName, or search/query/keyword. */
export function computeGetItemDetailsMissingFields(args: VapiGetItemDetailsArgs): string[] {
  return args.itemId || args.itemName || args.search ? [] : ["item_identifier"];
}

/** The name to search by when no itemId was given — itemName takes priority over a generic search/query/keyword value. */
export function resolveItemSearchName(args: VapiGetItemDetailsArgs): string | null {
  return args.itemName ?? args.search ?? null;
}

interface MenuItemRowLike {
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  isAvailable: boolean;
  allergensJson: Prisma.JsonValue;
  dietaryTagsJson: Prisma.JsonValue;
}

function toStringArrayOrUndefined(value: Prisma.JsonValue | null | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

export interface VapiMenuItemDetail {
  name: string;
  category?: string;
  description?: string;
  price?: string;
  available?: boolean;
  dietary_tags?: string[];
  allergens?: string[];
}

export interface VapiMenuItemCandidate {
  name: string;
  category?: string;
  price?: string;
}

/** Maps a MenuItem row to the curated detail shape returned to Vapi — never the raw Prisma row. */
export function toVoiceMenuItemDetail(item: MenuItemRowLike, categoryName?: string | null): VapiMenuItemDetail {
  const price = formatMenuPrice(item.priceCents, item.currency);
  const dietaryTags = toStringArrayOrUndefined(item.dietaryTagsJson);
  const allergens = toStringArrayOrUndefined(item.allergensJson);

  return {
    name: item.name,
    ...(categoryName ? { category: categoryName } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(price ? { price } : {}),
    available: item.isAvailable,
    ...(dietaryTags ? { dietary_tags: dietaryTags } : {}),
    ...(allergens ? { allergens } : {}),
  };
}

export function toVoiceMenuItemCandidate(item: MenuItemRowLike, categoryName?: string | null): VapiMenuItemCandidate {
  const price = formatMenuPrice(item.priceCents, item.currency);
  return {
    name: item.name,
    ...(categoryName ? { category: categoryName } : {}),
    ...(price ? { price } : {}),
  };
}

export interface VapiGetItemDetailsResponse {
  success: boolean;
  message: string;
  item_found?: boolean;
  ambiguous?: boolean;
  candidates?: VapiMenuItemCandidate[];
  item?: VapiMenuItemDetail;
  missing_fields?: string[];
}

export function buildItemDetailsMissingFieldsResponse(missingFields: string[]): VapiGetItemDetailsResponse {
  return {
    success: false,
    message: "I need a dish name to look that up. Could you tell me which item you'd like details on?",
    missing_fields: missingFields,
  };
}

export function buildItemNotFoundResponse(): VapiGetItemDetailsResponse {
  return {
    success: true,
    item_found: false,
    message: "I couldn't find that item on the menu. Please ask a staff member or check the full menu.",
  };
}

export function buildItemAmbiguousResponse(candidates: VapiMenuItemCandidate[]): VapiGetItemDetailsResponse {
  return {
    success: true,
    item_found: false,
    ambiguous: true,
    candidates,
    message: "I found a few items that might match — can you be more specific?",
  };
}

export function buildItemFoundResponse(item: VapiMenuItemDetail): VapiGetItemDetailsResponse {
  const priceText = item.price ? ` It's ${item.price}.` : "";
  const message =
    item.available === false
      ? `${item.name} is on our menu, but it may not be available right now.${priceText}`
      : `${item.name} is on our menu.${priceText}`;

  return {
    success: true,
    item_found: true,
    item,
    message,
  };
}
