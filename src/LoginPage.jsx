import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "./AuthContext";

function maskEmail(email) {
  if (!email || !email.includes("@")) return email || "";
  const [name, domain] = email.split("@");
  if (!name) return `***@${domain}`;
  const prefix = name.slice(0, Math.min(2, name.length));
  return `${prefix}***@${domain}`;
}

export default function Login() {
  const {
    login,
    verify2FA,
    verifyEmailOtp,
    pending2FA,
    pending2FASetup,
    pendingEmailOtp,
    begin2FASetup,
    complete2FASetup,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    async function loadSetup() {
      if (!pending2FASetup || pending2FASetup.otpauthUrl) return;

      setSetupLoading(true);
      setError("");

      try {
        await begin2FASetup();
      } catch (err) {
        console.error("begin2FASetup error:", err);
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            "Failed to start 2FA setup"
        );
      } finally {
        setSetupLoading(false);
      }
    }

    loadSetup();
  }, [pending2FASetup, begin2FASetup]);

  useEffect(() => {
    async function buildQr() {
      if (!pending2FASetup?.otpauthUrl) {
        setQrDataUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(pending2FASetup.otpauthUrl, {
          width: 220,
          margin: 2,
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error("QR generation error:", err);
        setQrDataUrl("");
      }
    }

    buildQr();
  }, [pending2FASetup?.otpauthUrl]);

  useEffect(() => {
    setError("");
    setCode("");
  }, [pending2FA, pending2FASetup, pendingEmailOtp]);

  async function onSubmitPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      console.error("Login error:", err);
      setError(err?.response?.data?.detail || err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit2FA(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await verify2FA(code);
      setCode("");
    } catch (err) {
      console.error("2FA error:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "2FA verification failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitEmailOtp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await verifyEmailOtp(code);
      setCode("");
    } catch (err) {
      console.error("Email OTP error:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Email verification failed"
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit2FASetup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await complete2FASetup(code);
      setCode("");
    } catch (err) {
      console.error("complete2FASetup error:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "2FA setup verification failed"
      );
    } finally {
      setLoading(false);
    }
  }

  if (pending2FASetup) {
    return (
      <div style={styles.page}>
        <form style={styles.card} onSubmit={onSubmit2FASetup}>
          <h2 style={styles.title}>Set up two-factor authentication</h2>
          <p style={styles.subtle}>
            Scan this QR code with your authenticator app, or use the manual key
            below.
          </p>

          {setupLoading ? (
            <div style={styles.subtle}>Preparing 2FA setup...</div>
          ) : (
            <>
              {qrDataUrl && (
                <div style={styles.qrWrap}>
                  <img
                    src={qrDataUrl}
                    alt="2FA QR code"
                    style={styles.qrImage}
                  />
                </div>
              )}

              {pending2FASetup.secret && (
                <div style={styles.secretBox}>
                  <div style={styles.secretLabel}>Manual setup key</div>
                  <div style={styles.secretValue}>
                    {pending2FASetup.secret}
                  </div>
                </div>
              )}

              {pending2FASetup.otpauthUrl && (
                <details style={styles.details}>
                  <summary style={styles.detailsSummary}>
                    Show OTP Auth URL
                  </summary>
                  <div style={styles.uriBox}>
                    <div style={styles.uriValue}>
                      {pending2FASetup.otpauthUrl}
                    </div>
                  </div>
                </details>
              )}
            </>
          )}

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            style={styles.input}
            maxLength={6}
          />

          <button
            type="submit"
            disabled={loading || setupLoading || code.length !== 6}
            style={styles.button}
          >
            {loading ? "Confirming..." : "Complete setup"}
          </button>

          {error && <div style={styles.error}>{error}</div>}
        </form>
      </div>
    );
  }

  if (pending2FA) {
    return (
      <div style={styles.page}>
        <form style={styles.card} onSubmit={onSubmit2FA}>
          <h2 style={styles.title}>Two-factor authentication</h2>
          <p style={styles.subtle}>
            Enter the 6-digit code for{" "}
            <strong>{pending2FA.user?.username}</strong>
          </p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            style={styles.input}
            maxLength={6}
          />

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={styles.button}
          >
            {loading ? "Verifying..." : "Verify code"}
          </button>

          {error && <div style={styles.error}>{error}</div>}
        </form>
      </div>
    );
  }

  if (pendingEmailOtp) {
    return (
      <div style={styles.page}>
        <form style={styles.card} onSubmit={onSubmitEmailOtp}>
          <h2 style={styles.title}>Email verification</h2>
          <p style={styles.subtle}>
            Enter the 6-digit code sent to{" "}
            <strong>{maskEmail(pendingEmailOtp.user?.email)}</strong>
          </p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            style={styles.input}
            maxLength={6}
          />

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            style={styles.button}
          >
            {loading ? "Verifying..." : "Verify code"}
          </button>

          {error && <div style={styles.error}>{error}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={onSubmitPassword}>
        <h2 style={styles.title}>Sign in</h2>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
          autoComplete="username"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          style={styles.button}
        >
          {loading ? "Signing in..." : "Login"}
        </button>

        {error && <div style={styles.error}>{error}</div>}
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b0f17",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    display: "grid",
    gap: 12,
    padding: 20,
    borderRadius: 16,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#e6e6e6",
  },
  title: {
    margin: 0,
    fontSize: 22,
  },
  subtle: {
    margin: 0,
    opacity: 0.8,
    fontSize: 14,
    lineHeight: 1.5,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e6e6e6",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.10)",
    color: "#e6e6e6",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    color: "#ffb4b4",
    fontSize: 14,
  },
  qrWrap: {
    display: "flex",
    justifyContent: "center",
    padding: 12,
    borderRadius: 12,
    background: "#ffffff",
  },
  qrImage: {
    width: 220,
    height: 220,
    display: "block",
  },
  secretBox: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  secretLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 6,
  },
  secretValue: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
    fontSize: 14,
    wordBreak: "break-all",
  },
  details: {
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: 12,
  },
  detailsSummary: {
    cursor: "pointer",
    fontSize: 13,
  },
  uriBox: {
    marginTop: 10,
    wordBreak: "break-all",
  },
  uriValue: {
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.9,
  },
};
