import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinPad } from "./PinPad";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("POS PinPad", () => {
  it("automatically submits a 4-digit PIN and clears it immediately", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PinPad onSubmit={onSubmit} submitLabel="Sign in" />);
    const input = screen.getByLabelText("Cashier PIN") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 4" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("1234"));
    expect(input.value).toBe("");
  });

  it("does not submit fewer than four digits", () => {
    const onSubmit = vi.fn();
    render(<PinPad onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Digit 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Digit 3" }));

    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a countdown and disables input during server lockout", () => {
    const lockedUntil = new Date(Date.now() + 30_000).toISOString();
    render(<PinPad onSubmit={vi.fn()} lockedUntil={lockedUntil} />);

    expect(screen.getByText(/PIN locked\. Try again in 0:30\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Digit 1" }).hasAttribute("disabled")).toBe(true);
  });
});
