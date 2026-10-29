const LAST_PAGE_KEY_PREFIX = "kubika:last-page";

export const SECTION_OVERVIEW_PATHS = {
  inventory: "/dashboard/inventory",
  sales: "/dashboard/sales",
  supply: "/dashboard/purchases",
  finance: "/dashboard/finance",
  projects: "/module-overview/projects",
  payroll: "/module-overview/payroll",
  reports: "/reports",
  system: "/module-overview/system",
} as const;

export function getSectionOverviewPath(sectionId: string | undefined) {
  if (!sectionId || !Object.prototype.hasOwnProperty.call(SECTION_OVERVIEW_PATHS, sectionId)) {
    return undefined;
  }
  return SECTION_OVERVIEW_PATHS[sectionId as keyof typeof SECTION_OVERVIEW_PATHS];
}

export function sectionLastPageKey(userId: string, sectionId: string) {
  return `${LAST_PAGE_KEY_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(sectionId)}`;
}

function isAllowedSectionPath(path: string, allowedPaths: string[]) {
  return allowedPaths.some(
    (allowedPath) =>
      path === allowedPath || path.startsWith(`${allowedPath}/`),
  );
}

export function readSectionLastPage(
  userId: string | undefined,
  sectionId: string,
  allowedPaths: string[],
): string | null {
  if (!userId) return null;

  const key = sectionLastPageKey(userId, sectionId);
  try {
    const savedPath = localStorage.getItem(key);
    if (!savedPath) return null;
    if (isAllowedSectionPath(savedPath, allowedPaths)) return savedPath;

    localStorage.removeItem(key);
    return null;
  } catch (error) {
    console.warn("[sectionNavigation] Unable to read saved section page", error);
    return null;
  }
}

export function saveSectionLastPage(
  userId: string | undefined,
  sectionId: string,
  path: string,
  allowedPaths: string[],
) {
  if (!userId || !isAllowedSectionPath(path, allowedPaths)) return;

  try {
    localStorage.setItem(sectionLastPageKey(userId, sectionId), path);
  } catch (error) {
    console.warn("[sectionNavigation] Unable to save section page", error);
  }
}
