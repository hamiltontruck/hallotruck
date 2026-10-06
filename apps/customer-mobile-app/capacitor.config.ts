import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hallotruck.shipper",
  appName: "HALLO Shipper",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
