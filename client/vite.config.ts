import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg"],
      manifest: {
        name: "Mozhiverse",
        short_name: "Mozhiverse",
        description: "Talk across language and speech barriers",
        theme_color: "#0c1421",
        background_color: "#0c1421",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"]
      }
    })
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": "http://localhost:3001"
    }
  }
});
