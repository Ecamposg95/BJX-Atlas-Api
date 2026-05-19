/**
 * Component-level RBAC: oculta children si el rol del user actual no tiene
 * el permiso. NO autoriza nada — el backend es la autoridad final.
 */
import type { Permission } from "@/lib/permissions";
import { hasPermission, type Role } from "@/lib/permissions";
import { useAuthStore } from "@/store/auth";

interface Props {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ permission, fallback = null, children }: Props) {
  const user = useAuthStore((s) => s.user) as { role?: Role } | null;
  const role = user?.role;
  if (!hasPermission(role, permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
