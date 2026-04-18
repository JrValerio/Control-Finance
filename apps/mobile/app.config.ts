import type { ExpoConfig } from "expo/config";

const appName = process.env.EXPO_APP_NAME?.trim() || "Control Finance";
const slug = process.env.EXPO_SLUG?.trim() || "control-finance";
const iosBundleIdentifier =
  process.env.EXPO_IOS_BUNDLE_ID?.trim() || "com.jrvalerio.controlfinance";
const androidPackage =
  process.env.EXPO_ANDROID_PACKAGE?.trim() || "com.jrvalerio.controlfinance";
const scheme = process.env.EXPO_SCHEME?.trim() || "controlfinance";
const owner = process.env.EXPO_OWNER?.trim();
const projectId = process.env.EAS_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: appName,
  slug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  scheme,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#102820",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#102820",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || "http://10.0.2.2:3001",
    eas: projectId
      ? {
          projectId,
        }
      : undefined,
  },
};

if (owner) {
  config.owner = owner;
}

export default config;
