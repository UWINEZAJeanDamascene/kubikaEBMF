import { describe, expect, it } from "vitest";
import { isPosBindingForActiveCompany } from "./posCompanyContext";

describe("POS company binding", () => {
  it("rejects a saved register binding from a different selected company", () => {
    expect(isPosBindingForActiveCompany("company-a", "company-b", true)).toBe(false);
  });

  it("allows a matching company binding and standalone POS-only sessions", () => {
    expect(isPosBindingForActiveCompany("company-a", "company-a", true)).toBe(true);
    expect(isPosBindingForActiveCompany("company-a", null, false)).toBe(true);
  });
});
