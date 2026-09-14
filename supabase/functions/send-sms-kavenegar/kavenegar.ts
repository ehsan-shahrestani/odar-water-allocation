// Supabase Auth gives HTTP hooks a total budget of five seconds. Four seconds
// accommodates Kavenegar's first TLS request while leaving time to return a
// structured hook response instead of letting Auth hit its own timeout.
export const KAVENEGAR_REQUEST_TIMEOUT_MS = 4_000;
export const KAVENEGAR_CANCELLED_STATUS = 13;
export const KAVENEGAR_MAX_ATTEMPTS = 2;
export const KAVENEGAR_RETRY_DELAY_MS = 300;

const ACCEPTED_MESSAGE_STATUSES = new Set([1, 4, 5, 10]);

interface KavenegarReturnValue {
  status?: unknown;
  message?: unknown;
}

interface KavenegarMessageEntry {
  messageid?: unknown;
  status?: unknown;
  statustext?: unknown;
}

export interface AcceptedKavenegarMessage {
  ok: true;
  messageId: number;
  status: number;
  statusText: string | null;
}

export interface RejectedKavenegarMessage {
  ok: false;
  messageId: number | null;
  providerStatus: number | null;
  providerMessage: string | null;
  messageStatus: number | null;
  statusText: string | null;
  reason: "provider-error" | "message-rejected" | "invalid-response";
}

export type KavenegarLookupResult =
  | AcceptedKavenegarMessage
  | RejectedKavenegarMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "string" && value.trim()
    ? Number(value)
    : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstMessageEntry(value: unknown): KavenegarMessageEntry | null {
  if (Array.isArray(value)) {
    return isRecord(value[0]) ? value[0] : null;
  }

  return isRecord(value) ? value : null;
}

export function evaluateKavenegarLookupResponse(
  value: unknown,
): KavenegarLookupResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      messageId: null,
      providerStatus: null,
      providerMessage: null,
      messageStatus: null,
      statusText: null,
      reason: "invalid-response",
    };
  }

  const returnValue = isRecord(value["return"])
    ? value["return"] as KavenegarReturnValue
    : null;
  const providerStatus = asFiniteNumber(returnValue?.status);
  const providerMessage = asNonEmptyString(returnValue?.message);

  if (providerStatus !== 200) {
    return {
      ok: false,
      messageId: null,
      providerStatus,
      providerMessage,
      messageStatus: null,
      statusText: null,
      reason: "provider-error",
    };
  }

  const entry = firstMessageEntry(value["entries"]);
  const messageId = asFiniteNumber(entry?.messageid);
  const messageStatus = asFiniteNumber(entry?.status);
  const statusText = asNonEmptyString(entry?.statustext);

  if (messageId === null || messageStatus === null) {
    return {
      ok: false,
      messageId,
      providerStatus,
      providerMessage,
      messageStatus,
      statusText,
      reason: "invalid-response",
    };
  }

  if (!ACCEPTED_MESSAGE_STATUSES.has(messageStatus)) {
    return {
      ok: false,
      messageId,
      providerStatus,
      providerMessage,
      messageStatus,
      statusText,
      reason: "message-rejected",
    };
  }

  return {
    ok: true,
    messageId,
    status: messageStatus,
    statusText,
  };
}

export function shouldRetryKavenegarLookup(
  result: KavenegarLookupResult,
): boolean {
  return !result.ok && result.messageStatus === KAVENEGAR_CANCELLED_STATUS;
}

export function normalizeIranianMobile(phone: string): string | null {
  const compact = phone.replace(/[^\d+]/g, "");
  let localPhone = compact;

  if (compact.startsWith("+98")) {
    localPhone = `0${compact.slice(3)}`;
  } else if (compact.startsWith("0098")) {
    localPhone = `0${compact.slice(4)}`;
  } else if (/^98\d{10}$/.test(compact)) {
    localPhone = `0${compact.slice(2)}`;
  } else if (/^9\d{9}$/.test(compact)) {
    localPhone = `0${compact}`;
  }

  return /^09\d{9}$/.test(localPhone) ? localPhone : null;
}

export function maskIranianMobile(phone: string): string {
  return phone.length === 11
    ? `${phone.slice(0, 4)}***${phone.slice(-4)}`
    : "invalid-phone";
}
