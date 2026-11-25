export function isPosBindingForActiveCompany(
  bindingCompanyId: string,
  activeCompanyId: string | null,
  isAuthenticated: boolean,
): boolean {
  if (!isAuthenticated) return true;
  return Boolean(activeCompanyId && bindingCompanyId === activeCompanyId);
}
