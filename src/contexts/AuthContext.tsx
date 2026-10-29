import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useAuthStore, User, Membership } from '@/store/authStore';
import authService from '@/services/authService';

// Auth Context Type
interface AuthContextType {
  user: User | null;
  companyId: string | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canEdit: () => boolean;
  isAdmin: () => boolean;
  login: (user: User, accessToken: string, refreshToken: string, memberships: Membership[]) => void;
  logout: () => void;
  refreshTokens: (accessToken: string, refreshToken: string) => void;
  updateUser: (user: Partial<User>) => void;
  setActiveCompany: (companyId: string, role: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useAuthStore();
  const setUser = store.setUser;

  // Ensure we have up-to-date permissions when app mounts or when token exists
  useEffect(() => {
    const init = async () => {
      try {
        // Use the persisted Zustand token first, with the legacy key as a
        // compatibility fallback for older sessions.
        const token = store.accessToken || localStorage.getItem('token');
        if (!token) return;

        // Refresh on startup so persisted permissions reflect role changes
        // made by an administrator since this user last signed in.
        const resp = await authService.getMe();
        if (resp.success && resp.data) {
          setUser(resp.data as unknown as User);
        } else if (resp.errorCode === 'TOKEN_EXPIRED' || resp.errorCode === 'TOKEN_INVALID') {
          // Do not leave an expired persisted token marked authenticated. The
          // next visit should show the login screen and obtain a fresh pair.
          store.logout();
        }
      } catch (err) {
        // Fail silently - permissions will be unavailable until explicit login
        console.warn('[AuthProvider] failed to refresh user permissions', err);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Check permissions based on user role/permissions
  const hasPermission = useCallback((permission: string) => {
    if (!store.user) return false;
    // Admin has all permissions
    if (store.user.role === 'admin' || store.user.role === 'super_admin' || store.user.role === 'platform_admin') return true;
    // Check if permission exists in user's permissions array
    const permissions = store.user.permissions as string[] | undefined;
    if (!permissions) return false;
    // Check for exact match, wildcard resource, or wildcard action
    const [resource, action] = permission.split(':');
    return permissions.some(p => {
      if (p === '*') return true;                          // Full wildcard
      if (p === `${resource}:*`) return true;              // Wildcard action for resource
      if (p === `*:${action}`) return true;                // Wildcard resource for action
      return p === permission;                             // Exact match
    });
  }, [store.user]);
  
  const hasAnyPermission = useCallback((permissions: string[]) => {
    if (!store.user) return false;
    // Admin has all permissions
    if (store.user.role === 'admin' || store.user.role === 'super_admin' || store.user.role === 'platform_admin') return true;
    const userPermissions = store.user.permissions as string[] | undefined;
    if (!userPermissions) return false;
    return permissions.some(permission => {
      const [resource, action] = permission.split(':');
      return userPermissions.some(p => {
        if (p === '*') return true;
        if (p === `${resource}:*`) return true;
        if (p === `*:${action}`) return true;
        return p === permission;
      });
    });
  }, [store.user]);
  
  const canEdit = useCallback(() => {
    if (!store.user) return false;
    // Admin and editor roles can edit
    return ['admin', 'super_admin', 'editor'].includes(store.user.role ?? '');
  }, [store.user]);
  
  const isAdmin = useCallback(() => {
    if (!store.user) return false;
    return store.user.role === 'admin' || store.user.role === 'super_admin' || store.user.role === 'platform_admin';
  }, [store.user]);
  
  const value: AuthContextType = {
    user: store.user,
    companyId: store.activeCompanyId,
    accessToken: store.accessToken,
    loading: store.loading,
    isAuthenticated: store.isAuthenticated,
    hasPermission,
    hasAnyPermission,
    canEdit,
    isAdmin,
    login: store.login,
    logout: store.logout,
    refreshTokens: store.refreshTokens,
    updateUser: store.updateUser,
    setActiveCompany: store.setActiveCompany,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return default values matching the store
    const store = useAuthStore.getState();
    return {
      user: store.user,
      companyId: store.activeCompanyId,
      accessToken: store.accessToken,
      loading: store.loading,
      isAuthenticated: store.isAuthenticated,
      hasPermission: () => false,
      hasAnyPermission: () => false,
      canEdit: () => false,
      isAdmin: () => false,
      login: store.login,
      logout: store.logout,
      refreshTokens: store.refreshTokens,
      updateUser: store.updateUser,
      setActiveCompany: store.setActiveCompany,
    };
  }
  return context;
}
