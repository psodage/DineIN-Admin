import { useEffect } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

interface AuthUser {
  role?: string;
}

export default function Index() {
  const router = useRouter();
  const {
    isAuthenticated,
    loading,
    user,
  } = useAuth() as {
    isAuthenticated: boolean;
    loading: boolean;
    user: AuthUser | null;
  };
  const { t } = useLanguage();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/Admin/AdminDashboard" as any);
    }
  }, [loading, isAuthenticated, user]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      <LanguageToggle />
      <Image
        source={require("../assets/images/logo2.png")}
        style={styles.logoImage}
        resizeMode="contain"
      />

      <Text style={styles.title}>{t("login_title")}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/Admin/AdminLoginScreen" as any)}
      >
        <Text style={styles.buttonText}>Admin Login</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  logoImage: {
    marginTop: 100,
    width: 120,
    height: 80,
    marginBottom: 24,
    marginLeft: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
    color: "#111827",
    marginLeft: 10,
  },
  button: {
    marginLeft: 10,
    marginTop: 8,
    height: 48,
    width: "95%",
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSecondary: {
    marginLeft: 10,
    marginTop: 12,
    height: 48,
    width: "95%",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondaryText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
});
