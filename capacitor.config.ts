import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Bloom for Android: the app loads the live site, so every site deploy updates it without a new APK.
 * "BloomApp/android" in the user agent tells the page it runs inside the app (src/shared/lib/native).
 */
const config: CapacitorConfig = {
  appId: "online.bloomlove.app",
  appName: "Bloom",
  webDir: "dist",
  appendUserAgent: "BloomApp/android",
  backgroundColor: "#f3f1f8",
  server: {
    url: "https://bloom-love.online",
    androidScheme: "https",
    allowNavigation: ["bloom-love.online", "*.bloom-love.online"],
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    // Keep the page below the status bar and above the gesture bar on Android 15+.
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_bloom",
      iconColor: "#36c89c",
    },
  },
};

export default config;
