/** Wrapper conveniente del store de auth. */
import { useAuthStore } from "@/store/auth";

export function useAuth() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return {
    user,
    token,
    logout,
    isAuthenticated: Boolean(token && user),
    role: user?.role,
  };
}
