import { describe, expect, it } from "vitest";
import {
  buildPosAuthPath,
  getCurrentPosReturnPath,
  getPosAuthReturnPath,
  normalizePosAuthReturnPath,
} from "./posAuthNavigation";

describe("POS authentication return navigation", () => {
  it("preserves Restaurant waiter and station routes through cashier sign-in", () => {
    const authPath = buildPosAuthPath("/pos/restaurant/orders", true);
    const search = authPath.slice(authPath.indexOf("?"));

    expect(getPosAuthReturnPath(search)).toBe("/pos/restaurant/orders");
    expect(new URLSearchParams(search).get("continue")).toBe("till");
  });

  it("preserves station routes and the existing till subroutes", () => {
    expect(getCurrentPosReturnPath("/pos/restaurant/display/bar", "")).toBe(
      "/pos/restaurant/display/bar",
    );
    expect(getCurrentPosReturnPath("/pos/restaurant/reports", "")).toBe(
      "/pos/restaurant/reports",
    );
    expect(getCurrentPosReturnPath("/pos/till/receipt/invoice-1", "?print=1")).toBe(
      "/pos/till/receipt/invoice-1?print=1",
    );
  });

  it("falls back to the standard till for invalid return paths", () => {
    expect(normalizePosAuthReturnPath("https://example.com")).toBe("/pos/till");
    expect(normalizePosAuthReturnPath("/launcher")).toBe("/pos/till");
  });
});
