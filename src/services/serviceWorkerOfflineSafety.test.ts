import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadServiceWorkerPolicy() {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const context = vm.createContext({
    self: { addEventListener: () => undefined },
    URL,
    Headers,
  });
  vm.runInContext(source, context);
  return context;
}

describe("service worker offline request safety", () => {
  it("classifies every POS and legacy POS endpoint as outside the generic queue", () => {
    const context = loadServiceWorkerPolicy();
    expect(vm.runInContext("isPosRequest('/api/pos/auth/me')", context)).toBe(true);
    expect(vm.runInContext("isPosRequest('/api/sales-legacy/offline-sync/push')", context)).toBe(true);
    expect(vm.runInContext("isPosRequest('/api/clients/1')", context)).toBe(false);
  });

  it("never saves credentials in generic queued request headers or bodies", async () => {
    const context = loadServiceWorkerPolicy();
    const safe = await vm.runInContext(`safeGenericQueueEntry({
      url: 'https://example.test/api/example',
      headers: new Headers({ accept: 'application/json', 'content-type': 'application/json' }),
      clone() { return { text: async () => '{"note":"offline note"}' }; }
    })`, context);
    expect(safe).toEqual({
      body: '{"note":"offline note"}',
      headers: { accept: "application/json", "content-type": "application/json" },
    });

    const withAuth = await vm.runInContext(`safeGenericQueueEntry({
      url: 'https://example.test/api/example',
      headers: new Headers({ authorization: 'Bearer secret' }),
      clone() { return { text: async () => '{"note":"safe"}' }; }
    })`, context);
    const withTokenBody = await vm.runInContext(`safeGenericQueueEntry({
      url: 'https://example.test/api/example',
      headers: new Headers(),
      clone() { return { text: async () => '{"sessionToken":"secret"}' }; }
    })`, context);
    expect(withAuth).toBeNull();
    expect(withTokenBody).toBeNull();
  });

  it("never captures POS requests in the generic queue even when their payload looks safe", async () => {
    const context = loadServiceWorkerPolicy();
    const queued = await vm.runInContext(`safeGenericQueueEntry({
      url: 'https://example.test/api/sales-legacy/offline-sync/push',
      headers: new Headers({ 'content-type': 'application/json' }),
      clone() { return { text: async () => '{"operationId":"sale-1"}' }; }
    })`, context);
    expect(queued).toBeNull();
  });

  it("does not queue opaque or uninspectable request bodies", async () => {
    const context = loadServiceWorkerPolicy();
    const queued = await vm.runInContext(`safeGenericQueueEntry({
      url: 'https://example.test/api/example',
      headers: new Headers(),
      clone() { return { text: async () => 'not-json' }; }
    })`, context);
    expect(queued).toBeNull();
  });
});
