/**
 * Espejo de app/security/permissions.py — mantener sincronizado a mano.
 * Si añades un permiso o cambias el matrix, actualiza ambos lados.
 */
export type Role =
  | "admin"
  | "director"
  | "gerente_sede"
  | "jefe_taller"
  | "recepcion"
  | "mecanico"
  | "almacen"
  | "cliente_corp"
  | "operador"
  | "viewer";

export const Permission = {
  WORK_ORDER_CREATE: "work_order:create",
  WORK_ORDER_UPDATE: "work_order:update",
  WORK_ORDER_TRANSITION: "work_order:transition",
  WORK_ORDER_CANCEL: "work_order:cancel",
  WORK_ORDER_DELETE: "work_order:delete",
  WORK_ORDER_QA_PASS: "work_order:qa_pass",
  WORK_ORDER_QA_FAIL: "work_order:qa_fail",
  WORK_ORDER_DELIVER: "work_order:deliver",
  ASSIGNMENT_CREATE: "assignment:create",
  ASSIGNMENT_OVERRIDE: "assignment:override_level",
  ASSIGNMENT_RELEASE: "assignment:release",
  ASSIGNMENT_READ: "assignment:read",
  MECHANIC_PROFILE_READ: "mechanic:profile:read",
  MECHANIC_PROFILE_WRITE: "mechanic:profile:write",
  MECHANIC_LEVEL_WRITE: "mechanic:level:write",
  MECHANIC_SKILLS_WRITE: "mechanic:skills:write",
  FINDING_REPORT: "finding:report",
  FINDING_APPROVE: "finding:approve",
  FINDING_REJECT: "finding:reject",
  FINDING_LIST: "finding:list",
  ME_TASKS_READ: "me:tasks:read",
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const PERMISSION_MATRIX: Record<Permission, Role[]> = {
  [Permission.WORK_ORDER_CREATE]: ["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"],
  [Permission.WORK_ORDER_UPDATE]: ["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"],
  [Permission.WORK_ORDER_TRANSITION]: ["admin", "gerente_sede", "jefe_taller", "recepcion", "mecanico", "almacen", "operador"],
  [Permission.WORK_ORDER_CANCEL]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.WORK_ORDER_DELETE]: ["admin"],
  [Permission.WORK_ORDER_QA_PASS]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.WORK_ORDER_QA_FAIL]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.WORK_ORDER_DELIVER]: ["admin", "gerente_sede", "recepcion"],
  [Permission.ASSIGNMENT_CREATE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.ASSIGNMENT_OVERRIDE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.ASSIGNMENT_RELEASE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.ASSIGNMENT_READ]: ["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "viewer"],
  [Permission.MECHANIC_PROFILE_READ]: ["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "mecanico"],
  [Permission.MECHANIC_PROFILE_WRITE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.MECHANIC_LEVEL_WRITE]: ["admin", "gerente_sede"],
  [Permission.MECHANIC_SKILLS_WRITE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.FINDING_REPORT]: ["admin", "mecanico"],
  [Permission.FINDING_APPROVE]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.FINDING_REJECT]: ["admin", "gerente_sede", "jefe_taller"],
  [Permission.FINDING_LIST]: ["admin", "director", "gerente_sede", "jefe_taller", "viewer"],
  [Permission.ME_TASKS_READ]: ["admin", "mecanico"],
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[permission]?.includes(role) ?? false;
}
