import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import App from "./WorkspaceApp.jsx";
import ClientPortal from "./components/ClientPortal.jsx";
import "./styles/globals.css";
import "./styles/desk-theme.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
      {new URLSearchParams(window.location.hash.slice(1)).has("portal") ? (
        <ClientPortal />
      ) : (
        <App />
      )}
    </MotionConfig>
  </StrictMode>,
);
