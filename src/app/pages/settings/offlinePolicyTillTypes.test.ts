import { describe, expect, it } from "vitest";
import { getOfflinePolicyTillTypes } from "./offlinePolicyTillTypes";

describe("offline policy till-type choices", () => {
  it("offers wholesale configuration before a wholesale register exists", () => {
    expect(getOfflinePolicyTillTypes(["retail"])).toEqual(["retail", "wholesale"]);
  });

  it("keeps configured and active types available without duplicates", () => {
    expect(getOfflinePolicyTillTypes(["RETAIL", "restaurant"], ["wholesale", "salon"]))
      .toEqual(["retail", "wholesale", "restaurant", "salon"]);
  });

  it("ignores invalid till-type labels", () => {
    expect(getOfflinePolicyTillTypes(["retail", "Wholesale Till", "../admin"]))
      .toEqual(["retail", "wholesale"]);
  });
});
