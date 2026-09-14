import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  evaluateKavenegarLookupResponse,
  KAVENEGAR_MAX_ATTEMPTS,
  KAVENEGAR_REQUEST_TIMEOUT_MS,
  KAVENEGAR_RETRY_DELAY_MS,
  maskIranianMobile,
  normalizeIranianMobile,
  shouldRetryKavenegarLookup,
} from "./kavenegar.ts";

const KAVENEGAR_TEMPLATE = "verification";
const FUNCTION_RELEASE = "2026-09-14.2";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

type LogLevel = "info" | "warn" | "error";
type LogDetails = Record<string, boolean | number | string | null>;

interface SendSmsHookPayload {
  user: {
    phone: string;
  };
  sms: {
    otp: string;
  };
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function hookErrorResponse(status: number, message: string): Response {
  return jsonResponse(status, {
    error: {
      http_code: status,
      message,
    },
  });
}

function logEvent(
  level: LogLevel,
  event: string,
  requestId: string,
  requestStartedAt: number,
  details: LogDetails = {},
): void {
  const message = JSON.stringify({
    component: "send-sms-kavenegar",
    release: FUNCTION_RELEASE,
    event,
    requestId,
    elapsedMs: Date.now() - requestStartedAt,
    ...details,
  });

  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else {
    console.log(message);
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function isTimeoutError(error: unknown): boolean {
  const name = errorName(error);
  return name === "TimeoutError" || name === "AbortError";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSendSmsHookPayload(value: unknown): value is SendSmsHookPayload {
  if (typeof value !== "object" || value === null) return false;

  const payload = value as Record<string, unknown>;
  const user = payload["user"];
  const sms = payload["sms"];

  return (
    typeof user === "object" &&
    user !== null &&
    typeof (user as Record<string, unknown>)["phone"] === "string" &&
    typeof sms === "object" &&
    sms !== null &&
    typeof (sms as Record<string, unknown>)["otp"] === "string"
  );
}

function verifyHookPayload(
  body: string,
  headers: Record<string, string>,
  configuredSecrets: string,
): SendSmsHookPayload {
  for (const configuredSecret of configuredSecrets.split("|")) {
    const secret = configuredSecret.trim().replace(/^v1,whsec_/, "");
    if (!secret) continue;

    try {
      const payload: unknown = new Webhook(secret).verify(body, headers);
      if (isSendSmsHookPayload(payload)) return payload;
    } catch {
      // A rotated hook secret may be listed next; try it before rejecting.
    }
  }

  throw new Error("Invalid hook signature or payload");
}

Deno.serve(async (request: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const requestStartedAt = Date.now();
  let stage = "request_received";

  logEvent("info", "hook.request.received", requestId, requestStartedAt, {
    method: request.method,
    contentLength: Number(request.headers.get("content-length") ?? 0),
    hasWebhookId: request.headers.has("webhook-id"),
    hasWebhookTimestamp: request.headers.has("webhook-timestamp"),
    hasWebhookSignature: request.headers.has("webhook-signature"),
  });

  if (request.method !== "POST") {
    logEvent("warn", "hook.request.method_rejected", requestId, requestStartedAt);
    return hookErrorResponse(405, "Method not allowed");
  }

  const apiKey = Deno.env.get("KAVENEGAR_API_KEY")?.trim();
  const hookSecrets = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim();

  if (!apiKey || !hookSecrets) {
    logEvent("error", "hook.configuration.missing", requestId, requestStartedAt, {
      apiKeyConfigured: Boolean(apiKey),
      hookSecretConfigured: Boolean(hookSecrets),
    });
    return hookErrorResponse(500, "SMS service is not configured");
  }

  try {
    stage = "read_body";
    const body = await request.text();
    logEvent("info", "hook.body.read", requestId, requestStartedAt, {
      bodyLength: body.length,
    });

    stage = "verify_signature";
    const payload = verifyHookPayload(
      body,
      Object.fromEntries(request.headers.entries()),
      hookSecrets,
    );
    logEvent("info", "hook.signature.verified", requestId, requestStartedAt, {
      configuredSecretCount: hookSecrets.split("|").length,
    });

    stage = "validate_payload";
    const receptor = normalizeIranianMobile(payload.user.phone);
    const otp = payload.sms.otp;

    if (!receptor || !/^\d{6}$/.test(otp)) {
      logEvent("warn", "hook.payload.rejected", requestId, requestStartedAt, {
        phoneValid: Boolean(receptor),
        otpLength: otp.length,
      });
      return hookErrorResponse(400, "Invalid SMS hook payload");
    }

    const maskedReceptor = maskIranianMobile(receptor);
    const form = new URLSearchParams({
      receptor,
      token: otp,
      template: KAVENEGAR_TEMPLATE,
      type: "sms",
    });
    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;

    logEvent("info", "hook.payload.accepted", requestId, requestStartedAt, {
      receptor: maskedReceptor,
      otpLength: otp.length,
    });

    for (let attempt = 1; attempt <= KAVENEGAR_MAX_ATTEMPTS; attempt += 1) {
      stage = "provider_fetch";
      const attemptStartedAt = Date.now();
      logEvent("info", "provider.request.started", requestId, requestStartedAt, {
        receptor: maskedReceptor,
        operation: "verify.lookup",
        attempt,
        timeoutMs: KAVENEGAR_REQUEST_TIMEOUT_MS,
      });

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(KAVENEGAR_REQUEST_TIMEOUT_MS),
        });
      } catch (error: unknown) {
        const timedOut = isTimeoutError(error);
        logEvent("error", "provider.request.failed", requestId, requestStartedAt, {
          receptor: maskedReceptor,
          attempt,
          error: errorName(error),
          timedOut,
          attemptDurationMs: Date.now() - attemptStartedAt,
        });
        return hookErrorResponse(
          502,
          timedOut ? "SMS provider timed out" : "SMS provider request failed",
        );
      }

      logEvent("info", "provider.response.received", requestId, requestStartedAt, {
        receptor: maskedReceptor,
        attempt,
        httpStatus: response.status,
        attemptDurationMs: Date.now() - attemptStartedAt,
      });

      stage = "provider_parse";
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        logEvent("error", "provider.response.invalid_json", requestId, requestStartedAt, {
          receptor: maskedReceptor,
          attempt,
          httpStatus: response.status,
          attemptDurationMs: Date.now() - attemptStartedAt,
        });
        return hookErrorResponse(502, "SMS provider returned an invalid response");
      }

      const result = evaluateKavenegarLookupResponse(responseBody);
      if (response.ok && result.ok) {
        logEvent("info", "provider.message.accepted", requestId, requestStartedAt, {
          receptor: maskedReceptor,
          attempt,
          messageId: result.messageId,
          messageStatus: result.status,
          statusText: result.statusText,
          attemptDurationMs: Date.now() - attemptStartedAt,
        });
        logEvent("info", "hook.request.succeeded", requestId, requestStartedAt, {
          receptor: maskedReceptor,
          attempts: attempt,
        });
        return jsonResponse(200);
      }

      const retryable = response.ok && shouldRetryKavenegarLookup(result);
      logEvent(retryable ? "warn" : "error", "provider.message.rejected", requestId, requestStartedAt, {
        receptor: maskedReceptor,
        attempt,
        httpStatus: response.status,
        messageId: result.messageId,
        providerStatus: result.ok ? null : result.providerStatus,
        providerMessage: result.ok ? null : result.providerMessage,
        messageStatus: result.ok ? result.status : result.messageStatus,
        statusText: result.statusText,
        reason: result.ok ? "http-error" : result.reason,
        retryable,
        attemptDurationMs: Date.now() - attemptStartedAt,
      });

      if (!retryable || attempt === KAVENEGAR_MAX_ATTEMPTS) {
        return hookErrorResponse(502, "SMS provider rejected the message");
      }

      logEvent("warn", "provider.retry.scheduled", requestId, requestStartedAt, {
        receptor: maskedReceptor,
        nextAttempt: attempt + 1,
        retryDelayMs: KAVENEGAR_RETRY_DELAY_MS,
      });
      await delay(KAVENEGAR_RETRY_DELAY_MS);
    }

    logEvent("error", "hook.request.exhausted", requestId, requestStartedAt, {
      receptor: maskedReceptor,
    });
    return hookErrorResponse(502, "SMS provider rejected the message");
  } catch (error: unknown) {
    logEvent("error", "hook.request.failed", requestId, requestStartedAt, {
      stage,
      error: errorName(error),
    });
    return hookErrorResponse(401, "Invalid SMS hook request");
  }
});
