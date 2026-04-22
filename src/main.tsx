import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InstallPrompt } from "./components/InstallPrompt";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <InstallPrompt />
  </ErrorBoundary>
);
