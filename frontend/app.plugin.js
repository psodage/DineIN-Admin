const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

/**
 * Ensure the main Android activity is not resizeable, which prevents
 * split-screen / multi-window usage for additional security.
 */
module.exports = function withDineINAndroidSecurity(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      manifest
    );

    if (!mainActivity.$) {
      mainActivity.$ = {};
    }

    mainActivity.$["android:resizeableActivity"] = "false";

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    if (!application.$) {
      application.$ = {};
    }
    // Allow HTTP to local/dev API (EXPO_PUBLIC_API_BASE_URL) on physical devices.
    application.$["android:usesCleartextTraffic"] = "true";

    return config;
  });
};

