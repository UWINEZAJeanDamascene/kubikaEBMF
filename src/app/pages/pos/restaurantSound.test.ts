import { afterEach, describe, expect, it, vi } from "vitest";
import { playRestaurantAlert } from "./restaurantSound";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restaurant alert sound", () => {
  it("plays a three-tone alert lasting at least two seconds", () => {
    const frequency = { setValueAtTime: vi.fn() };
    const gainParam = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    const oscillator = {
      type: "",
      frequency,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };
    const gain = { gain: gainParam, connect: vi.fn() };
    const context = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(),
    };
    vi.stubGlobal("AudioContext", vi.fn(function AudioContextMock() { return context; }));

    playRestaurantAlert();

    const stopAt = oscillator.stop.mock.calls[0][0] as number;
    expect(stopAt - context.currentTime).toBeGreaterThanOrEqual(2);
    expect(frequency.setValueAtTime).toHaveBeenCalledTimes(3);
    expect(oscillator.start).toHaveBeenCalledWith(context.currentTime);
  });
});
