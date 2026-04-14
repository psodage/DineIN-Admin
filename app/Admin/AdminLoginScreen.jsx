import React, { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from "react-native";
import axios from "axios";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { Ionicons } from "@expo/vector-icons";

export default function AdminLoginScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t("alert_error"), t("login_missing_fields"));
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        { email, password }
      );

      await login(res.data.token, res.data.user);
      Alert.alert(t("alert_success"), t("login_success"));
      // Defer navigation so AuthProvider commits token before guarded screens mount
      // (otherwise dashboard can see stale isAuthenticated and redirect home).
      setTimeout(() => router.replace("/Admin/AdminDashboard"), 0);
    } catch (err) {
      const msg =
        err?.response?.data?.message || t("login_failed_generic");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LanguageToggle />
      <View style={styles.topHeroOverlay}>
        <View style={styles.topBrand}>
          <Image
            source={require("../../assets/images/logo2.png")}
            style={styles.logoCorner}
            resizeMode="contain"
          />
          <View style={styles.brandDivider} />
          <View style={styles.topBrandText}>
            <Text style={styles.brandTitle}>DineIN</Text>
            <Text style={styles.brandMeta}>Eat Smart. Live Easy.</Text>
          </View>
        </View>

        <View style={styles.heroBottomSpacer} />
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>{t("Admin Login")}</Text>

        <Text style={styles.subtitle}>{t("email_label")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("email_placeholder")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />

        <Text style={styles.subtitle}>{t("password_label")}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordTextInput]}
            placeholder={t("password_placeholder")}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={styles.passwordToggle}
            onPress={() => setShowPassword((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={showPassword ? "eye-off" : "eye"}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t("Sign In")}</Text>
          )}
        </TouchableOpacity>
      </View>

   

      {/* <TouchableOpacity
        onPress={() => router.push("/Admin/AdminSignupScreen")}
        style={styles.signupWrapper}
      >
        <Text style={styles.footerText}>
          Don't have an account? <Text style={styles.signupLink}>Sign Up</Text>
        </Text>
      </TouchableOpacity> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  topHeroOverlay: {
    marginTop:20,
    width: "100%",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingTop: 18,
    paddingBottom: 12,
    marginBottom: 22,
    marginRight:30,
  },
  topBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoCorner: {
    width: 55,
    height: 55,
  },
  brandDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#000000",
    marginHorizontal: 12,
  },
  topBrandText: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#000000",
  },
  brandMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.9,
    color: "#000000",
  },
  heroHeadline: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    lineHeight: 22,
  },
  heroBottomSpacer: {
    height: 6,
  },
  form: {
    marginTop:125,
    width: "100%",
    alignItems: "center",
    maxWidth: 420,
  },
  formTitle: {
    width: "100%",
    textAlign: "left",
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 28,
    
  },
  subtitle: {
    width: "100%",
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",

    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  passwordRow: {
    width: "100%",
    marginBottom: 16,
    height: 48,
  
    borderWidth: 1,
    borderColor: "#D1D5DB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
  },
  passwordTextInput: {
    width: "100%",
    marginLeft: 0,
    marginBottom: 0,
    height: 48,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    flex: 1,
  },
  passwordToggle: {
    paddingLeft: 8,
    paddingVertical: 8,
  },
  button: {
    marginTop: 8,
    height: 48,
    width: "100%",
  
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footerText: {
    marginTop: 16,
    marginLeft: 10,
    fontSize: 13,
    color: "#6B7280",
  },
  link: {
    color: "red",
    fontWeight: "600",
  },
  signupWrapper: {
    marginLeft: 10,
    marginTop: 8,
  },
  signupLink: {
    color: "#2563EB",
    fontWeight: "600",
  },
});

