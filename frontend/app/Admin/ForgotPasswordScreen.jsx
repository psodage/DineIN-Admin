import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../config";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert(t("alert_error"), t("forgot_missing_email"));
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE_URL}/api/auth/send-otp`, { email });

      if (res.status >= 200 && res.status < 300) {
        Alert.alert(
          t("alert_success"),
          t("forgot_success"),
          [{
            text: "OK",
            onPress: () =>
              router.push({
                pathname: "/Admin/ResetPasswordScreen",
                params: { email },
              }),
          }]
        );
      }
    } catch (err) {
      let msg = err.response?.data?.message || err.message || t("forgot_failed_generic");
      if (msg === "User not found") msg = t("forgot_user_not_found");
      if (err.response?.status === 429) msg = t("otp_rate_limit");
      if (err.request && !err.response) msg = "Cannot reach server. Check that the backend is running.";
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LanguageToggle/>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Image
          source={require("../../assets/images/back-button.png")}
          style={styles.backButton}
          resizeMode="contain"
        />
      </TouchableOpacity>
      <Text style={styles.title}>{t("forgot_title")}</Text>
      <Text style={styles.subtitle}>{t("forgot_subtitle")}</Text>

      <Text style={styles.label}>{t("email_label")}</Text>
      <TextInput
        style={styles.input}
        placeholder="admin@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>{t("forgot_button")}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    backgroundColor: "#F3F4F6",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
    height: 48,
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
  backButton: {
    width: 24,
    height: 24,
    marginBottom: 80,
  },
});

