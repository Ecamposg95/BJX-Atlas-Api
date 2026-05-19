/** Hook RBAC: devuelve si el usuario actual tiene el permiso. */
import { Permission, hasPermission, type Role } from "@/lib/permissions";
import { useAuth } from "./useAuth";

export function usePermission(permission: Permission): boolean {
  const { role } = useAuth();
  return hasPermission(role as Role | undefined, permission);
}

export { Permission };
