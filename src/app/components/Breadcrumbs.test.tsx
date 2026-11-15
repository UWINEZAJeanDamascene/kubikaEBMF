import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { Breadcrumbs } from "./Breadcrumbs";

afterEach(() => cleanup());

describe("Breadcrumbs", () => {
  it("uses high-contrast inverse colors over the launcher header", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/launcher"]}>
        <Breadcrumbs variant="inverse" />
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-slot="breadcrumb-link"]')?.className).toContain("text-white/70");
    expect(container.querySelector('[data-slot="breadcrumb-page"]')?.className).toContain("text-white");
  });
});
