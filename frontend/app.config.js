/**
 * Expo / EAS configuration (bare-compatible: native projects are generated via
 * `eas build` or `npx expo prebuild`, not a managed-only workflow).
 *
 * OTA (EAS Update) ships JS, assets, and UI only. A new APK/AAB is required when:
 * - You add/upgrade a library with native code (expo install / npm with native modules)
 * - You change android.package, permissions, plugins, or app.plugin.js manifest edits
 * - You bump `expo.version` (runtimeVersion policy: appVersion must match the binary)
 * - You upgrade Expo SDK or change expo-build-properties / gradle settings
 * - You change the EAS project or signing credentials
 */
require("dotenv").config();

const EAS_PROJECT_ID = "c9475616-9c2d-4dd5-ba9a-01be20989ff6";

/**
 * OTA only for EAS binaries. Do NOT use EAS_BUILD alone — it can be set in the
 * shell and breaks Expo Go with "Failed to download remote update".
 * Set EXPO_ENABLE_EAS_UPDATES=true in eas.json build profiles only.
 */
const enableUpdates =
  process.env.EXPO_ENABLE_EAS_UPDATES === "true" ||
  process.env.EAS_UPDATE === "true";

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: "DineIN",
    slug: "DineIN",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "dinein",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.sodagep1.DineIN",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    updates: enableUpdates
      ? {
          enabled: true,
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          checkAutomatically: "NEVER",
          fallbackToCacheTimeout: 0,
        }
      : {
          enabled: false,
          checkAutomatically: "NEVER",
        },
    ...(enableUpdates
      ? {
          runtimeVersion: {
            policy: "appVersion",
          },
        }
      : {}),
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "@react-native-community/datetimepicker",
      "./app.plugin.js",
      ...(enableUpdates
        ? [
            [
              "expo-updates",
              {
                checkAutomatically: "NEVER",
              },
            ],
          ]
        : []),
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  },
};
