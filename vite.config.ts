import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { DEPLOY_BASE } from "./src/app/deployBase";

export default defineConfig({
  plugins: [react()],
  base: DEPLOY_BASE,
  server: {
    open: true,
  },
});
