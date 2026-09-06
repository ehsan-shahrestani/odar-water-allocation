import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const KAVENEGAR_TEMPLATE = "verification";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

interface SendSmsHookPayload {
  user: {
    phone: string;
  };
  sms: {
    otp: string;
  };
}

interface KavenegarResponse {
  return?: {
    status?: number;
  };
}

function jsonResponse(status: number): Response {
  return new Response("{}", { status, headers: JSON_HEADERS });
}

function normalizeIranianMobile(phone: string): string | null {
  const compact = phone.replace(/[\s\-()]/g, "");
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
  if (request.method !== "POST") return jsonResponse(405);

  const apiKey = Deno.env.get("KAVENEGAR_API_KEY")?.trim();
  const hookSecrets = Deno.env.get("SEND_SMS_HOOK_SECRET")?.trim();

  if (!apiKey || !hookSecrets) {
    console.error("Required SMS secrets are not configured");
    return jsonResponse(500);
  }

  try {
    const body = await request.text();
    const payload = verifyHookPayload(
      body,
      Object.fromEntries(request.headers.entries()),
      hookSecrets,
    );
    const receptor = normalizeIranianMobile(payload.user.phone);
    const otp = payload.sms.otp;

    if (!receptor || !/^\d{6}$/.test(otp)) {
      console.error("Rejected invalid SMS hook payload");
      return jsonResponse(400);
    }

    const form = new URLSearchParams({
      receptor,
      token: otp,
      template: KAVENEGAR_TEMPLATE,
      type: "sms",
    });
    const endpoint = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });

    let providerStatus: number | undefined;
    try {
      const result = (await response.json()) as KavenegarResponse;
      providerStatus = result.return?.status;
    } catch {
      // A malformed upstream response is handled as a failed delivery below.
    }

    if (!response.ok || providerStatus !== 200) {
      console.error("Kavenegar delivery failed", {
        httpStatus: response.status,
        providerStatus,
      });
      return jsonResponse(502);
    }

    return jsonResponse(200);
  } catch (error: unknown) {
    console.error("SMS hook request failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse(401);
  }
});
