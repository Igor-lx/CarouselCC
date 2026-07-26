import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // gh-pages deploy base; the data-gen urlBase mirrors it (carousel-data.config*.json).
  base: "/CarouselCC/",
  server: {
    open: true,
  },
});
