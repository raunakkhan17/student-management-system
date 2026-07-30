import { AppModule, PermissionAction } from '@prisma/client';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/config/prisma';

type PermissionKey = `${AppModule}:${PermissionAction}`;

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Set<PermissionKey>;
  expiresAt: number;
}

/**
 * Role permissions change rarely but are read on every request, so they are
 * cached in-process with a short TTL. (Redis is explicitly out of scope.)
 */
const cache = new Map<UserRole, CacheEntry>();

function toKey(module: AppModule, action: PermissionAction): PermissionKey {
  return `${module}:${action}`;
}

/** Drops cached permissions so the next read reflects a settings change. */
export function invalidatePermissionCache(role?: UserRole): void {
  if (role) {
    cache.delete(role);
    return;
  }
  cache.clear();
}

async function loadPermissions(role: UserRole): Promise<Set<PermissionKey>> {
  const rows = await prisma.rolePermission.findMany({
    where: { role, allowed: true },
    select: { module: true, action: true },
  });

  return new Set(rows.map((row) => toKey(row.module, row.action)));
}

export async function getRolePermissions(role: UserRole): Promise<Set<PermissionKey>> {
  const cached = cache.get(role);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const permissions = await loadPermissions(role);
  cache.set(role, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/**
 * SUPER_ADMIN bypasses the matrix by design (PRD §5: "Full System"), which also
 * guarantees the institution can never lock itself out of the settings module.
 */
export async function hasPermission(
  role: UserRole,
  module: AppModule,
  action: PermissionAction,
): Promise<boolean> {
  if (role === 'SUPER_ADMIN') return true;
  const permissions = await getRolePermissions(role);
  return permissions.has(toKey(module, action));
}

/** Returns the full grant list for a role — used by the client to drive UI affordances. */
export async function listPermissionKeys(role: UserRole): Promise<PermissionKey[]> {
  if (role === 'SUPER_ADMIN') {
    const modules = Object.values(AppModule);
    const actions = Object.values(PermissionAction);
    return modules.flatMap((module) => actions.map((action) => toKey(module, action)));
  }

  return [...(await getRolePermissions(role))];
}
