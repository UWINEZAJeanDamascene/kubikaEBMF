import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { capabilitiesApi, EffectiveCapabilities } from "@/lib/api";

export function useEffectiveCapabilities() {
  const { isAuthenticated, companyId } = useAuth();

  return useQuery<EffectiveCapabilities>({
    queryKey: ["effective-capabilities", companyId],
    queryFn: async () => {
      const response = await capabilitiesApi.getEffective();
      return response.data;
    },
    enabled: isAuthenticated && Boolean(companyId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function isModuleEnabled(
  capabilities: EffectiveCapabilities | undefined,
  moduleCode: string,
) {
  return capabilities?.modules?.[moduleCode] === true;
}
