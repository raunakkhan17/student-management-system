import type { AppModule, PermissionAction, UserRole } from '@/types/enums';

export type PermissionKey = `${AppModule}:${PermissionAction}`;

export function permissionKey(module: AppModule, action: PermissionAction): PermissionKey {
  return `${module}:${action}`;
}

/**
 * Checks a capability against the grant list returned by the API.
 *
 * This drives UI affordances only — the server re-checks every request, so a
 * tampered client gains nothing beyond seeing buttons that will fail.
 */
export function can(
  permissions: ReadonlySet<string>,
  module: AppModule,
  action: PermissionAction,
): boolean {
  return permissions.has(permissionKey(module, action));
}

/** True when the role may see the module at all. */
export function canViewModule(permissions: ReadonlySet<string>, module: AppModule): boolean {
  return can(permissions, module, 'VIEW');
}

/** Landing route for each role after sign-in (PRD Module 2). */
export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  SUPER_ADMIN: '/dashboard',
  ADMIN: '/dashboard',
  TEACHER: '/dashboard',
  STUDENT: '/dashboard',
  PARENT: '/dashboard',
  ACCOUNTANT: '/dashboard',
  LIBRARIAN: '/dashboard',
};
