import * as Updates from "expo-updates";

/**
 * EAS Update (OTA) — JavaScript, assets, and UI only.
 *
 * Requires a new APK/AAB (not OTA) when you change:
 * - Native modules, Expo SDK, or config plugins
 * - android.package, signing, or AndroidManifest (app.plugin.js)
 * - expo.version (runtimeVersion policy: appVersion)
 *
 * Safe to ship via OTA:
 * - React components, screens, styles, copy
 * - Images/fonts bundled in the update
 * - JS business logic and API client code
 */

/**
 * Check for an update, download if available, and reload the app.
 * Never throws — failures are logged and the app continues on the embedded bundle.
 *
 * @returns {Promise<{ status: string, error?: unknown }>}
 */
export async function checkAndApplyOTAUpdate() {
  if (__DEV__) {
    return { status: "skipped_dev" };
  }

  if (!Updates.isEnabled) {
    // Expo Go and dev clients without expo-updates enabled.
    return { status: "skipped_disabled" };
  }

  try {
    const checkResult = await Updates.checkForUpdateAsync();
    if (!checkResult.isAvailable) {
      return { status: "no_update" };
    }

    const fetchResult = await Updates.fetchUpdateAsync();
    if (!fetchResult.isNew) {
      return { status: "fetch_not_new" };
    }

    // reloadAsync() restarts the app with the new JS bundle.
    await Updates.reloadAsync();
    return { status: "reloaded" };
  } catch (error) {
    console.warn("[OTA] Update check failed:", error);
    return { status: "error", error };
  }
}
