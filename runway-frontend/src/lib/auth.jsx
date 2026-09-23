import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, clearSession, getStoredUser, getToken, setSession, ApiError } from "./api";

// Keep one context object even when this module is hot-reloaded, otherwise
// consumers that reloaded separately would see an empty context and blank out.
const AuthContext = globalThis.__runwayAuthContext ?? createContext(null);
globalThis.__runwayAuthContext = AuthContext;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = getToken();
    if (existing) {
      setToken(existing);
      setUser(getStoredUser());
    }
    setReady(true);
    // warm the services up in the background
    api.health(true).catch(() => {});

    const onSignedOut = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("runway:signed-out", onSignedOut);
    return () => window.removeEventListener("runway:signed-out", onSignedOut);
  }, []);

  const adopt = useCallback((result) => {
    setSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user ?? null);
    return result;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      isDemo: Boolean(user?.is_demo),
      isAuthenticated: Boolean(token),
      login: (email, password) => api.login(email, password).then(adopt),
      register: (email, password) => api.register(email, password).then(adopt),
      startDemo: () => api.demo().then(adopt),
      signOut,
    }),
    [user, token, ready, adopt, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Turn any API failure into the right toast, and report if it was handled. */
export function toastApiError(error) {
  if (error instanceof ApiError) {
    if (error.code === "DEMO_READ_ONLY") {
      toast.error("Demo is read-only. Create an account to save changes.");
      return;
    }
    toast.error(error.message);
    return;
  }
  toast.error(error?.message || "Something went wrong");
}
