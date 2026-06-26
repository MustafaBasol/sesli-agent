/**
 * menuImportWriteGates.ts — pure safety-gate evaluation for the Phase 40
 * menu import write mode (and Phase 43 replace mode). No I/O, no database
 * access, no Supabase access. Takes an explicit env object (never reads
 * `process.env` itself) so it can be unit tested without mutating global state.
 *
 * Policy reference: docs/menu-data-migration-plan.md
 */

export type WriteModeGateResult = {
  /** Whether write mode was requested at all (MENU_IMPORT_WRITE_ENABLED=true). */
  writeRequested: boolean;
  /** Whether every required write gate passed and the write may proceed. */
  canWrite: boolean;
  /** Human-readable reasons writing is blocked (empty when canWrite is true). */
  abortReasons: string[];
  databaseUrl: string | undefined;
  restaurantId: string | undefined;
  safety: {
    writeEnabled: boolean;
    confirmationMatched: boolean;
    productionAllowed: boolean;
    productionConfirmationProvided: boolean;
  };
  /** Phase 43 — replace mode gate result, evaluated alongside write gates. */
  replace: {
    /** Whether replace mode was requested (MENU_IMPORT_REPLACE_EXISTING=true). */
    requested: boolean;
    /** Whether replace mode is fully allowed (all write gates + replace gates passed). */
    allowed: boolean;
    /** Whether the exact replace confirmation phrase was provided. */
    confirmationMatched: boolean;
    /** Human-readable reasons replace is blocked even when write is allowed. */
    abortReasons: string[];
  };
};

const PRODUCTION_CONFIRMATION_PHRASE = "I_UNDERSTAND_THIS_WRITES_MENU_DATA";
export const REPLACE_CONFIRMATION_PHRASE = "I_UNDERSTAND_THIS_WILL_DISABLE_MENU_RECORDS_NOT_IN_SOURCE";

export function evaluateWriteModeGates(env: NodeJS.ProcessEnv): WriteModeGateResult {
  const writeRequested = env.MENU_IMPORT_WRITE_ENABLED === "true";
  const restaurantId = env.MENU_IMPORT_RESTAURANT_ID;
  const confirmRestaurantId = env.MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID;
  const databaseUrl = env.MENU_IMPORT_DATABASE_URL || env.DATABASE_URL;
  const isProduction = env.NODE_ENV === "production";
  const productionAllowed = env.MENU_IMPORT_ALLOW_PRODUCTION === "true";
  const productionConfirmationProvided = env.MENU_IMPORT_PRODUCTION_CONFIRMATION === PRODUCTION_CONFIRMATION_PHRASE;

  const confirmationMatched = Boolean(restaurantId) && Boolean(confirmRestaurantId) && restaurantId === confirmRestaurantId;

  // Phase 43 — replace mode gates
  const replaceRequested = env.MENU_IMPORT_REPLACE_EXISTING === "true";
  const replaceConfirmationMatched = env.MENU_IMPORT_REPLACE_CONFIRMATION === REPLACE_CONFIRMATION_PHRASE;
  const replaceAbortReasons: string[] = [];

  if (replaceRequested) {
    if (!writeRequested) {
      replaceAbortReasons.push("MENU_IMPORT_REPLACE_EXISTING=true requires MENU_IMPORT_WRITE_ENABLED=true");
    }
    if (!replaceConfirmationMatched) {
      replaceAbortReasons.push(
        `MENU_IMPORT_REPLACE_CONFIRMATION must equal "${REPLACE_CONFIRMATION_PHRASE}" exactly`
      );
    }
  }

  const abortReasons: string[] = [];

  if (!writeRequested) {
    return {
      writeRequested: false,
      canWrite: false,
      abortReasons,
      databaseUrl,
      restaurantId,
      safety: { writeEnabled: false, confirmationMatched, productionAllowed, productionConfirmationProvided },
      replace: {
        requested: replaceRequested,
        allowed: false,
        confirmationMatched: replaceConfirmationMatched,
        abortReasons: replaceAbortReasons,
      },
    };
  }

  if (!confirmRestaurantId) {
    abortReasons.push("MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID is required when MENU_IMPORT_WRITE_ENABLED=true");
  } else if (!confirmationMatched) {
    abortReasons.push("MENU_IMPORT_CONFIRM_TARGET_RESTAURANT_ID does not match MENU_IMPORT_RESTAURANT_ID — aborting to avoid writing to the wrong restaurant");
  }

  if (!databaseUrl) {
    abortReasons.push("DATABASE_URL is required when MENU_IMPORT_WRITE_ENABLED=true");
  }

  if (isProduction && !(productionAllowed && productionConfirmationProvided)) {
    abortReasons.push(
      "NODE_ENV=production requires both MENU_IMPORT_ALLOW_PRODUCTION=true and MENU_IMPORT_PRODUCTION_CONFIRMATION=\"" +
        PRODUCTION_CONFIRMATION_PHRASE +
        '" — aborting'
    );
  }

  const canWrite = abortReasons.length === 0;
  const replaceAllowed = canWrite && replaceRequested && replaceAbortReasons.length === 0;

  return {
    writeRequested: true,
    canWrite,
    abortReasons,
    databaseUrl,
    restaurantId,
    safety: { writeEnabled: true, confirmationMatched, productionAllowed, productionConfirmationProvided },
    replace: {
      requested: replaceRequested,
      allowed: replaceAllowed,
      confirmationMatched: replaceConfirmationMatched,
      abortReasons: replaceAbortReasons,
    },
  };
}
