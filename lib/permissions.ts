export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  USER: "user",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.OWNER]: 3,
  [ROLES.ADMIN]: 2,
  [ROLES.USER]: 1,
};

// Permission matrix
export const PERMISSIONS = {
  // User management
  MANAGE_USERS: [ROLES.OWNER, ROLES.ADMIN],
  VIEW_USERS: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER],
  
  // Financial
  MANAGE_BILLING: [ROLES.OWNER, ROLES.ADMIN],
  VIEW_BILLING: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER],
  DELETE_BILLING: [ROLES.OWNER],
  
  // Students
  MANAGE_STUDENTS: [ROLES.OWNER, ROLES.ADMIN],
  VIEW_STUDENTS: [ROLES.OWNER, ROLES.ADMIN, ROLES.USER],
  
  // Employees
  MANAGE_EMPLOYEES: [ROLES.OWNER, ROLES.ADMIN],
  VIEW_EMPLOYEES: [ROLES.OWNER, ROLES.ADMIN],
  
  // Reports
  VIEW_REPORTS: [ROLES.OWNER, ROLES.ADMIN],
  EXPORT_REPORTS: [ROLES.OWNER],
  
  // Settings
  MANAGE_SETTINGS: [ROLES.OWNER],
  
  // Audit logs
  VIEW_AUDIT_LOGS: [ROLES.OWNER],
} as const;

export type PermissionAction = keyof typeof PERMISSIONS;

export function hasPermission(
  userRole: Role,
  allowedRoles: readonly string[]
): boolean {
  return allowedRoles.includes(userRole);
}

export function hasRole(userRole: Role, minimumRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

export function canAccess(
  userRole: Role,
  permission: PermissionAction
): boolean {
  return hasPermission(userRole, PERMISSIONS[permission]);
}

// Legacy compatibility
export function hasPermissionLegacy(
  user: { role: Role } | null,
  action: 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve'
): boolean {
  if (!user) return false;
  
  switch (action) {
    case 'read':
      return true;
    case 'create':
    case 'update':
    case 'delete':
    case 'approve':
      return hasRole(user.role, ROLES.ADMIN);
    case 'delete_critical':
      return user.role === ROLES.OWNER;
    default:
      return false;
  }
}
