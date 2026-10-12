// Route path constants - matching backend API structure

// Public auth routes (no auth required)
export const PUBLIC_ROUTES = {
  // Landing/Home
  HOME: '/',
  
  // Auth routes
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
} as const;

// Protected app routes (auth required)
export const APP_ROUTES = {
  // Dashboard
  DASHBOARD: '/dashboard',
  INVENTORY_DASHBOARD: '/dashboard/inventory',
  SALES_DASHBOARD: '/dashboard/sales',
  PURCHASE_DASHBOARD: '/dashboard/purchases',
  FINANCE_DASHBOARD: '/dashboard/finance',
  
  // System Management
  USERS: '/users',
  ROLES: '/roles',
  SECURITY: '/security',
  BACKUPS: '/backups',
  DEPARTMENTS: '/departments',
  BULK_DATA: '/imports',
  AUDIT_TRAIL: '/audit-trail',
  
  // Notifications
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_SETTINGS: '/notifications/settings',
  
  // Other
  TESTIMONIALS: '/testimonials',
  
  // Products
  PRODUCTS: '/products',
  PRODUCT_DETAIL: '/products/:id',
  PRODUCT_NEW: '/products/new',
  
  // Categories
  CATEGORIES: '/categories',
  
  // Warehouses
  WAREHOUSES: '/warehouses',
  PRICE_LISTS: '/price-lists',
  
  // Stock Levels
  STOCK_LEVELS: '/stock-levels',
  
  // Stock Movements
  STOCK_MOVEMENTS: '/stock-movements',
  
  // Stock Transfers
  STOCK_TRANSFERS: '/stock-transfers',
  STOCK_TRANSFER_NEW: '/stock-transfers/new',
  STOCK_TRANSFER_DETAIL: '/stock-transfers/:id',
  
  // Stock Audits
  STOCK_AUDITS: '/stock-audits',
  STOCK_AUDIT_DETAIL: '/stock-audits/:id',
  
  // Direct Purchases
  PURCHASES: '/purchases',
  PURCHASE_NEW: '/purchases/new',
  PURCHASE_DETAIL: '/purchases/:id',

  // Purchase Orders
  PURCHASE_ORDERS: '/purchase-orders',
  PURCHASE_ORDER_NEW: '/purchase-orders/new',
  PURCHASE_ORDER_DETAIL: '/purchase-orders/:id',
  PURCHASE_ORDER_EDIT: '/purchase-orders/:id/edit',

  // GRN (Goods Received Note)
  GRN: '/grn',
  GRN_NEW: '/grn/new',
  GRN_DETAIL: '/grn/:id',
  GRN_EDIT: '/grn/:id/edit',

  // Purchase Returns
  PURCHASE_RETURNS: '/purchase-returns',
  PURCHASE_RETURN_NEW: '/purchase-returns/new',
  PURCHASE_RETURN_DETAIL: '/purchase-returns/:id',
  
  // Accounts Receivable (read-only ledger)
  AR_RECEIPTS: '/ar-receipts',
  
  // AR Aging
  AR_AGING: '/ar-aging',
  
  // Accounts Payable (read-only ledger)
  AP_PAYMENTS: '/ap-payments',
  
  // Bank Accounts
  BANK_ACCOUNTS: '/bank-accounts',
  BANK_ACCOUNT_NEW: '/bank-accounts/new',
  BANK_ACCOUNT_DETAIL: '/bank-accounts/:id',
  
  // Petty Cash
  PETTY_CASH: '/petty-cash',
  PETTY_CASH_TRANSACTIONS: '/petty-cash/:id/transactions',
  
  // Fixed Assets
  ASSETS: '/assets',
  ASSET_NEW: '/assets/new',
  ASSET_DETAIL: '/assets/:id',
  ASSET_EDIT: '/assets/:id/edit',
  
  // Liabilities
  LIABILITIES: '/liabilities',
  LIABILITY_NEW: '/liabilities/new',
  LIABILITY_DETAIL: '/liabilities/:id',
  LIABILITY_EDIT: '/liabilities/:id/edit',

  // Budgets
  BUDGETS: '/budgets',
  BUDGET_NEW: '/budgets/new',
  BUDGET_DETAIL: '/budgets/:id',
  BUDGET_EDIT: '/budgets/:id/edit',

  // Journal Entries
  JOURNAL: '/journal',
  JOURNAL_NEW: '/journal/new',
  JOURNAL_DETAIL: '/journal/:id',
  JOURNAL_TRIAL_BALANCE: '/journal/trial-balance',
  JOURNAL_GENERAL_LEDGER: '/journal/general-ledger',

  // Company (for multi-tenancy)
  COMPANY_SELECT: '/company',
  
  // Platform Admin
  PLATFORM_ADMIN: '/platform-admin',

  // Platform Admin Setup (one-time bootstrap)
  SETUP_PLATFORM_ADMIN: '/setup-platform-admin',
} as const;

// Route groups
export const ROUTE_GROUPS = {
  PUBLIC: Object.values(PUBLIC_ROUTES),
  PROTECTED: Object.values(APP_ROUTES),
} as const;

// All routes as array
export const ALL_ROUTES = [
  ...ROUTE_GROUPS.PUBLIC,
  ...ROUTE_GROUPS.PROTECTED,
] as const;

// Permission to route mapping
export const ROUTE_PERMISSIONS: Record<string, string> = {
  [APP_ROUTES.DASHBOARD]: 'dashboard:read',
  [APP_ROUTES.USERS]: 'users:read',
  [APP_ROUTES.ROLES]: 'roles:read',
  [APP_ROUTES.SECURITY]: 'security:read',
  [APP_ROUTES.BACKUPS]: 'backups:read',
  [APP_ROUTES.DEPARTMENTS]: 'departments:read',
  [APP_ROUTES.BULK_DATA]: 'import:read',
  [APP_ROUTES.AUDIT_TRAIL]: 'auditLogs:read',
  [APP_ROUTES.NOTIFICATIONS]: 'notifications:read',
  [APP_ROUTES.NOTIFICATION_SETTINGS]: 'notifications:read',
  [APP_ROUTES.TESTIMONIALS]: 'users:read',
  [APP_ROUTES.PRODUCTS]: 'products:read',
  [APP_ROUTES.CATEGORIES]: 'categories:read',
  [APP_ROUTES.WAREHOUSES]: 'stock:read',
  [APP_ROUTES.PRICE_LISTS]: 'warehouses:update',
  [APP_ROUTES.STOCK_LEVELS]: 'stock:read',
  [APP_ROUTES.STOCK_MOVEMENTS]: 'stock:read',
  [APP_ROUTES.STOCK_TRANSFERS]: 'stock:read',
  [APP_ROUTES.STOCK_AUDITS]: 'stock:read',
  [APP_ROUTES.PURCHASES]: 'stock:read',
  [APP_ROUTES.PURCHASE_ORDERS]: 'stock:read',
  [APP_ROUTES.GRN]: 'stock:read',
  [APP_ROUTES.PURCHASE_RETURNS]: 'stock:read',
  [APP_ROUTES.PURCHASE_DASHBOARD]: 'stock:read',
  [APP_ROUTES.AP_PAYMENTS]: 'stock:read',
  [APP_ROUTES.BANK_ACCOUNTS]: 'stock:read',
};

// API routes (for reference)
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password',
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    UNREAD_COUNT: '/notifications/unread-count',
    MARK_READ: (id: string) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
  },
} as const;

// Type exports
export type PublicRoute = typeof PUBLIC_ROUTES[keyof typeof PUBLIC_ROUTES];
export type AppRoute = typeof APP_ROUTES[keyof typeof APP_ROUTES];
