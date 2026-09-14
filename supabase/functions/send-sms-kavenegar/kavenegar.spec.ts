import { describe, expect, it } from "vitest";
import {
  evaluateKavenegarLookupResponse,
  maskIranianMobile,
  normalizeIranianMobile,
  shouldRetryKavenegarLookup,
} from "./kavenegar";

describe("evaluateKavenegarLookupResponse", () => {
  it("accepts a lookup response queued for the carrier", () => {
    expect(evaluateKavenegarLookupResponse({
      return: { status: 200, message: "تایید شد" },
      entries: [{ messageid: 8792343, status: 5, statustext: "ارسال به مخابرات" }],
    })).toEqual({
      ok: true,
      messageId: 8792343,
      status: 5,
      statusText: "ارسال به مخابرات",
    });
  });

  it("rejects a provider-level failure", () => {
    expect(evaluateKavenegarLookupResponse({
      return: { status: 418, message: "اعتبار کافی نیست" },
      entries: null,
    })).toMatchObject({
      ok: false,
      providerStatus: 418,
      reason: "provider-error",
    });
  });

  it("rejects a message reported as undelivered", () => {
    expect(evaluateKavenegarLookupResponse({
      return: { status: 200, message: "تایید شد" },
      entries: [{ messageid: 8792343, status: 11, statustext: "نرسیده به گیرنده" }],
    })).toMatchObject({
      ok: false,
      messageId: 8792343,
      messageStatus: 11,
      reason: "message-rejected",
    });
  });

  it("retries only messages explicitly cancelled by Kavenegar", () => {
    const cancelled = evaluateKavenegarLookupResponse({
      return: { status: 200, message: "تایید شد" },
      entries: [{ messageid: 456, status: 13, statustext: "لغو شده" }],
    });
    const blocked = evaluateKavenegarLookupResponse({
      return: { status: 200, message: "تایید شد" },
      entries: [{ messageid: 789, status: 14, statustext: "مسدود شده" }],
    });

    expect(shouldRetryKavenegarLookup(cancelled)).toBe(true);
    expect(shouldRetryKavenegarLookup(blocked)).toBe(false);
  });

  it("rejects malformed success responses without message metadata", () => {
    expect(evaluateKavenegarLookupResponse({
      return: { status: 200, message: "تایید شد" },
      entries: [],
    })).toMatchObject({
      ok: false,
      reason: "invalid-response",
    });
  });
});

describe("Iranian mobile helpers", () => {
  it("normalizes both affected number prefixes", () => {
    expect(normalizeIranianMobile("+989905913852")).toBe("09905913852");
    expect(normalizeIranianMobile("989152404098")).toBe("09152404098");
  });

  it("masks phone numbers before logging", () => {
    expect(maskIranianMobile("09905913852")).toBe("0990***3852");
    expect(maskIranianMobile("invalid")).toBe("invalid-phone");
  });
});
