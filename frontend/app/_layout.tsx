import "react-native-gesture-handler";
import "react-native-reanimated";
import { Stack } from "expo-router";
import { LanguageProvider } from "../LanguageContext";
import { AuthProvider } from "../lib/AuthContext";
import AppSecurityWrapper from "../components/AppSecurityWrapper";
import { useOTAUpdates } from "../hooks/useOTAUpdates";

export default function RootLayout() {
  useOTAUpdates();

  return (
    <AuthProvider>
      <LanguageProvider>
        <AppSecurityWrapper>
          <Stack screenOptions={{ headerShown: false }} />
        </AppSecurityWrapper>
      </LanguageProvider>
    </AuthProvider>
  );
}
