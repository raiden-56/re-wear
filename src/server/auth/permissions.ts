/**
 * Role-based access control matrix. This is the source of truth for authorization
 * checks; it is mirrored into the Role/Permission tables by the seed so administrators
 * can review it from Settings → Permissions.
 */
export const PERMISSIONS = {
  "booking:create": "Create pickup bookings",
  "booking:read:own": "View own bookings",
  "booking:read:any": "View all bookings",
  "booking:manage": "Reschedule, cancel or fail any booking",
  "booking:assign": "Assign collectors to bookings",
  "pickup:execute": "Execute assigned pickups",
  "weighing:record": "Record weighing at doorstep",
  "valuation:respond": "Approve or reject own valuations",
  "valuation:revise": "Issue revised valuations",
  "pricing:read": "View pricing rules",
  "pricing:manage": "Propose pricing rules",
  "pricing:approve": "Approve pricing rules",
  "payout:read:own": "View own payouts",
  "payout:read:any": "View all payouts",
  "payout:approve": "Approve customer payouts",
  "payout:initiate": "Initiate and retry payouts",
  "payout:reconcile": "Reconcile payouts with provider",
  "warehouse:receive": "Receive collection batches",
  "warehouse:sort": "Sort and inspect batches",
  "inventory:read": "View inventory",
  "inventory:manage": "Move, transfer and adjust inventory",
  "inventory:approve": "Approve inventory adjustments",
  "marketplace:buy": "Buy from the resale marketplace",
  "marketplace:manage": "Manage marketplace listings and orders",
  "b2b:buy": "Place B2B purchase requests",
  "b2b:manage": "Manage B2B listings and orders",
  "business:verify": "Verify business and partner accounts",
  "recycling:partner": "Recycler partner portal",
  "recycling:manage": "Manage recycler dispatches and settlements",
  "donation:partner": "Donation partner portal",
  "donation:manage": "Manage donation partners and donations",
  "customers:read": "View customers",
  "customers:manage": "Suspend / reactivate accounts",
  "reports:read": "View reports and analytics",
  "reports:export": "Export reports",
  "ops:manage": "Manage service areas, slots and collectors",
  "finance:manage": "Record operating costs and adjustments",
  "settings:manage": "Manage platform settings",
  "users:manage": "Manage staff accounts and roles",
  "audit:read": "View audit logs",
  "support:own": "Raise and view own support tickets",
  "support:manage": "Handle support tickets and disputes",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type RoleKey =
  | "CUSTOMER"
  | "COLLECTOR"
  | "WAREHOUSE_MANAGER"
  | "ADMIN"
  | "SUPER_ADMIN"
  | "B2B_BUYER"
  | "RECYCLER_PARTNER"
  | "DONATION_PARTNER";

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  CUSTOMER: ["booking:create", "booking:read:own", "valuation:respond", "payout:read:own", "marketplace:buy", "support:own", "pricing:read"],
  COLLECTOR: ["pickup:execute", "weighing:record", "support:own"],
  WAREHOUSE_MANAGER: [
    "warehouse:receive",
    "warehouse:sort",
    "inventory:read",
    "inventory:manage",
    "inventory:approve",
    "valuation:revise",
    "marketplace:manage",
    "recycling:manage",
    "donation:manage",
    "booking:read:any",
    "support:own",
  ],
  ADMIN: ALL.filter((p) => p !== "users:manage"),
  SUPER_ADMIN: ALL,
  B2B_BUYER: ["b2b:buy", "marketplace:buy", "support:own"],
  RECYCLER_PARTNER: ["recycling:partner", "b2b:buy", "support:own"],
  DONATION_PARTNER: ["donation:partner", "support:own"],
};

export function hasPermission(role: RoleKey, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Each role lands on its own application. */
export const ROLE_HOME: Record<RoleKey, string> = {
  CUSTOMER: "/app",
  COLLECTOR: "/collector",
  WAREHOUSE_MANAGER: "/warehouse",
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
  B2B_BUYER: "/business",
  RECYCLER_PARTNER: "/recycler",
  DONATION_PARTNER: "/partner",
};

/** Which roles may open which portal prefix. */
export const PORTAL_ROLES: Record<string, RoleKey[]> = {
  "/app": ["CUSTOMER"],
  "/collector": ["COLLECTOR"],
  "/warehouse": ["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"],
  "/admin": ["ADMIN", "SUPER_ADMIN"],
  "/business": ["B2B_BUYER"],
  "/recycler": ["RECYCLER_PARTNER"],
  "/partner": ["DONATION_PARTNER"],
};

export function canAccessPortal(role: RoleKey, pathname: string) {
  const prefix = Object.keys(PORTAL_ROLES).find((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!prefix) return true;
  return PORTAL_ROLES[prefix].includes(role);
}
