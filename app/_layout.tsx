import { Stack } from "expo-router";
import { TextInput } from "react-native";
import { LanguageProvider } from "../LanguageContext";
import { AuthProvider } from "../lib/AuthContext";
import AppSecurityWrapper from "../components/AppSecurityWrapper";

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.placeholderTextColor = "#6B7280";

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
