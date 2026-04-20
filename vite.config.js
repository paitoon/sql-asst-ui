import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ceo_asst/" : "/",

  plugins: [react()],

  server: {
    host: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:10001",
        changeOrigin: true,
      },
    },
  },

  /*
  build: {
    outDir: "/var/www/ceo-asst-ui"
  }
  */
}));