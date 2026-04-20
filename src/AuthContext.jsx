import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, { TOKEN_KEY } from "./api";

const AuthContext = createContext(null);

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setApiAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token, skewSeconds = 30) {
  if (!token) return true;

  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false; // if exp is missing, let backend decide

  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now + skewSeconds;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [pending2FA, setPending2FA] = useState(null);
  const [pending2FASetup, setPending2FASetup] = useState(null);
  const [pendingEmailOtp, setPendingEmailOtp] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const clearPendingStates = useCallback(() => {
    setPending2FA(null);
    setPending2FASetup(null);
    setPendingEmailOtp(null);
  }, []);

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    clearPendingStates();
    setApiAuthToken("");
  }, [clearPendingStates]);

  const saveAccessToken = useCallback((accessToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
    setApiAuthToken(accessToken);
  }, []);

  useEffect(() => {
    setApiAuthToken(token);
  }, [token]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      console.log("Auth init start, token =", token);

      if (!token) {
        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
        return;
      }

      if (isTokenExpired(token)) {
        console.warn("Stored token is expired or near expiry; clearing auth");
        if (mounted) {
          clearAuthState();
          setAuthLoading(false);
        }
        return;
      }

      if (mounted) setAuthLoading(true);

      try {
        const res = await api.get("/auth/me");
        if (mounted) {
          setUser(res.data);
        }
      } catch (e) {
        const status = e?.response?.status;
        console.error("/auth/me failed:", e);

        if (!mounted) return;

        if (status === 401) {
          // Real auth failure: clear session
          clearAuthState();
        } else {
          // Temporary/proxy/network/backend error: keep token, keep current user if any
          console.warn("Transient /auth/me error; keeping existing auth state");
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [token, clearAuthState]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== TOKEN_KEY) return;

      const nextToken = e.newValue || "";
      setToken(nextToken);
      setApiAuthToken(nextToken);

      if (!nextToken) {
        setUser(null);
        clearPendingStates();
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clearPendingStates]);

  const fetchMe = useCallback(
    async (nextToken = token) => {
      if (!nextToken) return null;

      if (isTokenExpired(nextToken)) {
        clearAuthState();
        throw new Error("Access token expired");
      }

      setApiAuthToken(nextToken);

      try {
        const res = await api.get("/auth/me");
        setUser(res.data);
        return res.data;
      } catch (e) {
        const status = e?.response?.status;

        if (status === 401) {
          clearAuthState();
        }

        throw e;
      }
    },
    [token, clearAuthState]
  );

  async function login(username, password) {
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);

    const res = await api.post("/auth/login", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (res.data?.requires_2fa_setup) {
      clearPendingStates();
      setPending2FASetup({
        setupToken: res.data.setup_token,
        user: res.data.user,
      });

      return {
        requires2FASetup: true,
        user: res.data.user,
      };
    }

    if (res.data?.requires_2fa) {
      clearPendingStates();
      setPending2FA({
        loginToken: res.data.login_token,
        user: res.data.user,
      });

      return {
        requires2FA: true,
        user: res.data.user,
      };
    }

    if (res.data?.requires_email_otp) {
      clearPendingStates();
      setPendingEmailOtp({
        loginToken: res.data.login_token,
        user: res.data.user,
      });

      return {
        requiresEmailOtp: true,
        user: res.data.user,
      };
    }

    const accessToken = res.data.access_token;
    saveAccessToken(accessToken);
    clearPendingStates();
    setUser(res.data.user ?? null);

    try {
      await fetchMe(accessToken);
    } catch (e) {
      console.error("fetchMe after login failed:", e);
    } finally {
      setAuthLoading(false);
    }

    return {
      requires2FA: false,
      requires2FASetup: false,
      requiresEmailOtp: false,
      user: res.data.user,
    };
  }

  async function begin2FASetup() {
    if (!pending2FASetup?.setupToken) {
      throw new Error("No pending 2FA setup");
    }

    const res = await api.post("/auth/2fa/setup/begin", {
      setup_token: pending2FASetup.setupToken,
    });

    setPending2FASetup((prev) => ({
      ...prev,
      secret: res.data.secret,
      otpauthUrl: res.data.otpauth_url,
    }));

    return res.data;
  }

  async function complete2FASetup(code) {
    if (!pending2FASetup?.setupToken) {
      throw new Error("No pending 2FA setup");
    }

    const res = await api.post("/auth/2fa/setup/complete", {
      setup_token: pending2FASetup.setupToken,
      code,
    });

    const accessToken = res.data.access_token;
    saveAccessToken(accessToken);
    clearPendingStates();
    setUser(res.data.user ?? null);

    try {
      await fetchMe(accessToken);
    } catch (e) {
      console.error("fetchMe after complete2FASetup failed:", e);
    } finally {
      setAuthLoading(false);
    }

    return res.data;
  }

  async function verify2FA(code) {
    if (!pending2FA?.loginToken) {
      throw new Error("No pending 2FA login");
    }

    const res = await api.post("/auth/verify-2fa", {
      login_token: pending2FA.loginToken,
      code,
    });

    const accessToken = res.data.access_token;
    saveAccessToken(accessToken);
    clearPendingStates();
    setUser(res.data.user ?? null);

    try {
      await fetchMe(accessToken);
    } catch (e) {
      console.error("fetchMe after verify2FA failed:", e);
    } finally {
      setAuthLoading(false);
    }

    return res.data;
  }

  async function verifyEmailOtp(code) {
    if (!pendingEmailOtp?.loginToken) {
      throw new Error("No pending email OTP login");
    }

    const res = await api.post("/auth/verify-email-otp", {
      login_token: pendingEmailOtp.loginToken,
      code,
    });

    const accessToken = res.data.access_token;
    saveAccessToken(accessToken);
    clearPendingStates();
    setUser(res.data.user ?? null);

    try {
      await fetchMe(accessToken);
    } catch (e) {
      console.error("fetchMe after verifyEmailOtp failed:", e);
    } finally {
      setAuthLoading(false);
    }

    return res.data;
  }

  function logout() {
    clearAuthState();
    setAuthLoading(false);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      pending2FA,
      pending2FASetup,
      pendingEmailOtp,
      authLoading,
      isAuthenticated: !!token && !!user,
      login,
      verify2FA,
      verifyEmailOtp,
      begin2FASetup,
      complete2FASetup,
      logout,
      fetchMe,
      clearAuthState,
    }),
    [
      token,
      user,
      pending2FA,
      pending2FASetup,
      pendingEmailOtp,
      authLoading,
      fetchMe,
      clearAuthState,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
