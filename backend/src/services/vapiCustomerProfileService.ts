import { prisma } from "../prisma/client";

export interface VapiCustomerRecord {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  email: string | null;
  notes: string | null;
}

const CUSTOMER_SELECT = { id: true, fullName: true, phoneNumber: true, email: true, notes: true } as const;

export interface CustomerLookupResult {
  customer: VapiCustomerRecord | null;
  conflict: boolean;
}

/**
 * Tenant-scoped customer lookup for the Vapi customer-profile adapters.
 * Prefers an exact normalizedPhone match, then falls back to email. If both
 * are supplied and resolve to two different Customer rows, this is reported
 * as a conflict rather than guessed at — see
 * buildCustomerProfileConflictResponse's docstring in customerProfileAdapter.ts.
 */
export async function lookupVapiCustomer(
  restaurantId: string,
  normalizedPhone: string | null,
  email: string | null
): Promise<CustomerLookupResult> {
  const [byPhone, byEmail] = await Promise.all([
    normalizedPhone
      ? prisma.customer.findUnique({
          where: { restaurantId_normalizedPhone: { restaurantId, normalizedPhone } },
          select: CUSTOMER_SELECT,
        })
      : Promise.resolve(null),
    email
      ? prisma.customer.findFirst({
          where: { restaurantId, email },
          select: CUSTOMER_SELECT,
        })
      : Promise.resolve(null),
  ]);

  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    return { customer: null, conflict: true };
  }

  return { customer: byPhone ?? byEmail ?? null, conflict: false };
}

export interface UpsertVapiCustomerInput {
  restaurantId: string;
  name: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  notes: string | null;
}

export interface UpsertVapiCustomerResult {
  action: "created" | "updated";
  customer: VapiCustomerRecord;
}

/**
 * Creates a Customer if `existing` is null, otherwise updates it in place.
 * Only fields with a non-empty input value are written — an existing
 * non-empty field is never overwritten with empty/null input (AGENTS.md
 * Phase 29 item 5).
 */
export async function upsertVapiCustomer(
  input: UpsertVapiCustomerInput,
  existing: VapiCustomerRecord | null
): Promise<UpsertVapiCustomerResult> {
  const { restaurantId, name, phone, normalizedPhone, email, notes } = input;

  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        ...(name ? { fullName: name } : {}),
        ...(phone ? { phoneNumber: phone, normalizedPhone } : {}),
        ...(email ? { email } : {}),
        ...(notes ? { notes } : {}),
      },
      select: CUSTOMER_SELECT,
    });
    return { action: "updated", customer: updated };
  }

  const created = await prisma.customer.create({
    data: {
      restaurantId,
      fullName: name,
      phoneNumber: phone,
      normalizedPhone,
      email,
      notes,
    },
    select: CUSTOMER_SELECT,
  });
  return { action: "created", customer: created };
}
