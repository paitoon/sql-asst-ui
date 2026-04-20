import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { AuthProvider } from "./AuthContext";
import ProtectedApp from "./ProtectedApp";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  </React.StrictMode>
);
