import { beforeEach, describe, expect, it } from "vitest";
import {
  readSectionLastPage,
  saveSectionLastPage,
  sectionLastPageKey,
} from "./sectionNavigation";

describe("section page persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses a separate key for each user and section", () => {
    expect(sectionLastPageKey("user:1", "finance")).not.toBe(
      sectionLastPageKey("user:2", "finance"),
    );
    expect(sectionLastPageKey("user:1", "finance")).not.toBe(
      sectionLastPageKey("user:1", "sales"),
    );
  });

  it("saves and restores only a route still allowed for the section", () => {
    const routes = ["/dashboard/finance", "/bank-accounts"];
    saveSectionLastPage("user-1", "finance", "/bank-accounts", routes);

    expect(readSectionLastPage("user-1", "finance", routes)).toBe("/bank-accounts");
    expect(readSectionLastPage("user-2", "finance", routes)).toBeNull();
    expect(readSectionLastPage("user-1", "sales", routes)).toBeNull();
  });

  it("clears saved routes that are no longer available or permitted", () => {
    const key = sectionLastPageKey("user-1", "finance");
    localStorage.setItem(key, "/removed-finance-page");

    expect(readSectionLastPage("user-1", "finance", ["/dashboard/finance"])).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("does not save a path outside the allowed section routes", () => {
    saveSectionLastPage("user-1", "finance", "/system-control", ["/dashboard/finance"]);

    expect(readSectionLastPage("user-1", "finance", ["/dashboard/finance"])).toBeNull();
  });

  it("preserves nested pages under an allowed section page", () => {
    const routes = ["/projects"];
    saveSectionLastPage("user-1", "projects", "/projects/project-42", routes);

    expect(readSectionLastPage("user-1", "projects", routes)).toBe("/projects/project-42");
    expect(readSectionLastPage("user-1", "projects", ["/projects/kanban"])).toBeNull();
  });
});
