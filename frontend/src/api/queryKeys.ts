/** Fuente única de query keys para React Query. */

export const queryKeys = {
  // Work Orders
  workOrders: () => ["work-orders"] as const,
  workOrdersList: (filters?: Record<string, unknown>) => ["work-orders", "list", filters] as const,
  workOrder: (id: string) => ["work-orders", id] as const,
  workOrderStatusHistory: (id: string) => ["work-orders", id, "status-history"] as const,

  // Assignments
  assignments: () => ["assignments"] as const,
  assignmentsList: (filters?: Record<string, unknown>) => ["assignments", "list", filters] as const,

  // Mechanics
  mechanics: (filters?: Record<string, unknown>) => ["mechanics", filters] as const,
  mechanic: (userId: string) => ["mechanics", userId] as const,

  // Me
  myTasks: () => ["me", "tasks"] as const,
  myProfile: () => ["me", "profile"] as const,

  // Findings
  findings: (filters?: Record<string, unknown>) => ["findings", filters] as const,
  finding: (id: string) => ["findings", id] as const,

  // Notifications
  notifications: (filters?: Record<string, unknown>) => ["notifications", filters] as const,
  notificationsUnread: () => ["notifications", "unread-count"] as const,
};
