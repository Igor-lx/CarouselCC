import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./globals.scss";
import App from "./app/App";
import { ThemeProvider } from "./shared/theme";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element not found");
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
