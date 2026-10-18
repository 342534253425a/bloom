/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { verificationPlugin } from "./src/server/plugin";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    verificationPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["mascot/wave.png", "img/*.webp"],
      manifest: {
        name: "Bloom",
        short_name: "Bloom",
        lang: "en",
        description: "Small habits. A brighter day.",
        theme_color: "#f6f4fb",
        background_color: "#f6f4fb",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "mascot/wave.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webp,woff2}", "mascot/wave.png"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Push and notification-click handlers live in public/push-sw.js.
        importScripts: ["/push-sw.js"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
