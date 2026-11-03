import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  permissions?: string[];
  roles?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
}

/**
 * ProtectedRoute - Route guard that checks user permissions
 * 
 * Usage:
 * <Route path="/products" element={
 *   <ProtectedRoute permission="products:read">
 *     <ProductsPage />
 *   </ProtectedRoute>
 * } />
 * 
 * For multiple permissions (any):
 * <ProtectedRoute permissions={["products:read", "stock:read"]}>
 *   <ProductsPage />
 * </ProtectedRoute>
 * 
 * For multiple permissions (all required):
 * <ProtectedRoute permissions={["products:read", "products:create"]} requireAll>
 *   <ProductCreatePage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({ 
  children, 
  permission, 
  permissions,
  roles,
  requireAll = false,
  fallback
}: ProtectedRouteProps) {
  const { isAuthenticated, user, hasPermission, hasAnyPermission, loading } = useAuth();
  const location = useLocation();

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check permissions
  const hasLegacyRole = Boolean(roles?.some((role) =>
    String(user?.role || "").toLowerCase() === role.toLowerCase() || user?.roles?.some((assigned) =>
      String(typeof assigned === "string" ? assigned : assigned?.name || "").toLowerCase() === role.toLowerCase(),
    ),
  ));
  let hasAccess = true;

  if (permission) {
    hasAccess = permission === "platform:admin" && user?.role === "platform_admin"
      ? true
      : hasPermission(permission) || hasLegacyRole;
  } else if (permissions && permissions.length > 0) {
    if (requireAll) {
      // Check if user has ALL permissions
      hasAccess = permissions.every(p => hasPermission(p)) || hasLegacyRole;
    } else {
      // Check if user has ANY permission
      hasAccess = hasAnyPermission(permissions) || hasLegacyRole;
    }
  }

  // No access - show fallback or redirect to dashboard
  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You don't have permission to access this page. 
            Contact your administrator if you need access.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
