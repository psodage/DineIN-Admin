import React, { useState } from "react";
import {
  View,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { API_BASE_URL } from "../../config";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const { t } = useLanguage();

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const handleVerifyOtp = async () => {
    if (!email || !otp) {
      Alert.alert(t("alert_error"), t("reset_otp_missing"));
      return;
    }
    try {
      setLoading(true);
      await axios.post(`${API_BASE_URL}/api/auth/verify-otp`, { email, otp });
      setOtpVerified(true);
      Alert.alert(t("alert_success"), t("otp_verify_success"));
    } catch (err) {
      const msg = err.response?.data?.message || t("reset_failed_generic");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert("Error", t("reset_email_missing"));
      return;
    }

    if (!otp) {
      Alert.alert(t("alert_error"), t("reset_otp_missing"));
      return;
    }

    if (!password || !confirmPassword) {
      Alert.alert(t("alert_error"), t("reset_passwords_missing"));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t("alert_error"), t("reset_passwords_mismatch"));
      return;
    }

    try {
      setLoading(true);

      await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
        email,
        otp,
        newPassword: password,
      });

      Alert.alert(t("alert_success"), t("reset_success"), [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (err) {
      const msg =
        err.response?.data?.message || t("reset_failed_generic");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LanguageToggle />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Image
          source={require("../../assets/images/back-button.png")}
          style={styles.backButton}
          resizeMode="contain"
        />
      </TouchableOpacity>
      <Text style={styles.title}>{t("reset_title")}</Text>
      <Text style={styles.subtitle}>
        {t("reset_subtitle_prefix")} {email} {t("reset_subtitle_suffix")}
      </Text>

      <Text style={styles.label}>{t("otp_label")}</Text>
      <View style={styles.otpRow}>
        <TextInput
          style={[
            styles.input,
            styles.otpInput,
            otpVerified && styles.otpInputDisabled,
          ]}
          placeholder={t("otp_placeholder")}
          keyboardType="numeric"
          maxLength={6}
          value={otp}
          editable={!otpVerified}
          onChangeText={(v) => {
            setOtp(v);
            setOtpVerified(false);
          }}
        />
        <TouchableOpacity
          style={[styles.verifyButton, otpVerified && styles.verifyButtonSuccess]}
          onPress={handleVerifyOtp}
          disabled={loading || !otp || otp.length !== 6 || otpVerified}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            otpVerified ? (
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyButtonText}>{t("verify_otp_button")}</Text>
            )
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>{t("new_password_label")}</Text>
      <TextInput
        style={[styles.input, !otpVerified && styles.passwordInputDisabled]}
        placeholder={t("new_password_placeholder")}
        secureTextEntry
        value={password}
        editable={otpVerified}
        onChangeText={setPassword}
      />

      <Text style={styles.label}>{t("confirm_new_password_label")}</Text>
      <TextInput
        style={[styles.input, !otpVerified && styles.passwordInputDisabled]}
        placeholder={t("confirm_new_password_placeholder")}
        secureTextEntry
        value={confirmPassword}
        editable={otpVerified}
        onChangeText={setConfirmPassword}
      />

      <TouchableOpacity
        style={[styles.button, !otpVerified && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!otpVerified || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Reset Password</Text>
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
  otpRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  otpInput: {
    flex: 1,
    marginBottom: 0,
  },
  verifyButton: {
    height: 48,
    minWidth: 100,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyButtonSuccess: {
    backgroundColor: "#059669",
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  otpInputDisabled: {
    backgroundColor: "#F3F4F6",
  },
  passwordInputDisabled: {
    backgroundColor: "#F3F4F6",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});