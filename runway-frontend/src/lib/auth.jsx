import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { api, getToken, setToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = getToken();
    if (!t) {
      setReady(true);
      return () => {};
    }
    api
      .me()
      .then((res) => alive && setUser(res?.user ?? null))
      .catch(() => {
        setToken(null);
        if (alive) setUser(null);
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const adopt = useCallback((res) => {
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = {
    user,
    ready,
    isAuthed: !!user,
    login: async (email, password) => adopt(await api.login(email, password)),
    register: async (email, password) => adopt(await api.register(email, password)),
    demo: async () => adopt(await api.demo()),
    logout: () => {
      setToken(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const { ready, isAuthed } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !isAuthed) navigate({ to: "/" });
  }, [ready, isAuthed, navigate]);
  return { ready, isAuthed };
}
