import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hallotruck.driver",
  appName: "HALLO Driver",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
