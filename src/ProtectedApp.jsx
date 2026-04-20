import { useAuth } from "./AuthContext";
import App from "./App";
import Login from "./LoginPage";

export default function ProtectedApp() {
  const { authLoading, isAuthenticated, pending2FA, user, token } = useAuth();

  console.log("ProtectedApp render:", {
    authLoading,
    isAuthenticated,
    pending2FA,
    user,
    token,
  });

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f17",
          color: "#e6e6e6",
          fontSize: 18,
        }}
      >
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <App />;
}