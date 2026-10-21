// Role-based access control. Edge-safe (no DB imports) so middleware can use it.

export const ROLES = ["ADMIN", "MERCHANT", "SUPPLIER", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Platform admin",
  MERCHANT: "Merchant (store owner)",
  SUPPLIER: "Supplier",
  CUSTOMER: "Customer",
};

export const PERMISSIONS = {
  "platform:manage": "Manage platform settings, plans and categories",
  "users:manage": "Change user roles and suspend accounts",
  "suppliers:approve": "Approve or reject supplier applications",
  "products:moderate": "Hide or restore any supplier product",
  "orders:view_all": "View every order on the platform",
  "audit:view": "Read the audit log",
  "store:manage": "Edit own store settings, theme and shipping",
  "catalog:import": "Browse the supplier catalog and import products",
  "store_products:manage": "Edit prices and visibility of own store products",
  "store_orders:manage": "View own store orders, refunds and returns",
  "discounts:manage": "Create and manage discount codes",
  "supplier_products:manage": "Create and edit own wholesale products",
  "fulfillment:update": "Accept orders and add tracking numbers",
  "own_orders:view": "View own purchases and tracking",
  "returns:request": "Request a return within the withdrawal period",
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  MERCHANT: [
    "store:manage",
    "catalog:import",
    "store_products:manage",
    "store_orders:manage",
    "discounts:manage",
    "own_orders:view",
    "returns:request",
  ],
  SUPPLIER: ["supplier_products:manage", "fulfillment:update", "own_orders:view", "returns:request"],
  CUSTOMER: ["own_orders:view", "returns:request"],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function homeForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "MERCHANT":
      return "/merchant";
    case "SUPPLIER":
      return "/supplier";
    default:
      return "/account";
  }
}

// Route prefixes and who may enter them — enforced in middleware and again in layouts.
export const PROTECTED_AREAS: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/merchant", roles: ["MERCHANT"] },
  { prefix: "/onboarding", roles: ["MERCHANT"] },
  { prefix: "/supplier", roles: ["SUPPLIER"] },
  { prefix: "/account", roles: ROLES },
  { prefix: "/dashboard", roles: ROLES },
];
