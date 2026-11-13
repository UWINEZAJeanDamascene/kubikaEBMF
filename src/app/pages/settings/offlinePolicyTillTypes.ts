/**
 * Offline policy choices. Wholesale is a configuration-only example until a
 * register is assigned that system till type; shared policy resolution remains
 * driven by the register's configured systemTillType.
 */
export function getOfflinePolicyTillTypes(
  registerTypes: Array<string | null | undefined> = [],
  configuredTypes: string[] = [],
): string[] {
  const available = new Set<string>(["retail", "wholesale"]);
  for (const value of [...registerTypes, ...configuredTypes]) {
    const normalized = String(value || "").trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]{0,39}$/.test(normalized)) available.add(normalized);
  }
  return ["retail", "wholesale", ...[...available].filter((type) => type !== "retail" && type !== "wholesale").sort()];
}
