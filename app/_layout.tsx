import { Stack } from "expo-router";
import { LanguageProvider } from "../LanguageContext";
import { AuthProvider } from "../lib/AuthContext";
import AppSecurityWrapper from "../components/AppSecurityWrapper";

export default function RootLayout() {
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
