import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useLanguage } from "../../LanguageContext";

export default function SnackQrScanner() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!permission) {
      requestPermission();
    } else if (!permission.granted && !permission.canAskAgain) {
      setErrorMessage(t("qr_scanner_err_permission"));
    }
  }, [permission, requestPermission, t]);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || validating) return;
    setScanned(true);
    setErrorMessage("");
    setValidationResult(null);

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      setErrorMessage(t("qr_scanner_err_invalid_json"));
      setScanned(false);
      return;
    }

    if (!parsed?.orderId) {
      setErrorMessage(t("qr_scanner_err_missing_order"));
      setScanned(false);
      return;
    }

    try {
      setValidating(true);
      let order;

      if (parsed.orderId === "bulk") {
        const orderIds = Array.isArray(parsed?.orderIds) ? parsed.orderIds : [];
        if (!orderIds.length) {
          setErrorMessage(t("qr_scanner_err_bulk_ids"));
          setScanned(false);
          return;
        }

        const res = await api.post(`/api/snack-orders/validate/bulk`, { orderIds });
        const payload = res?.data || {};
        const splitMembers = Array.isArray(payload?.members)
          ? payload.members
              .map((m) => ({
                _id: String(m?._id || "").trim(),
                name: String(m?.name || "").trim(),
                nameMr: String(m?.nameMr || m?.name || "").trim(),
              }))
              .filter((m) => m._id && (m.name || m.nameMr))
          : [];
        order = {
          _id: "BULK",
          quantity: Number(payload?.totalQuantity || parsed?.quantity || 0),
          totalPrice: Number(payload?.totalAmount || parsed?.totalPrice || 0),
          date: parsed?.orderDate || new Date().toISOString(),
          studentId: payload?.member || undefined,
          splitMembers,
          snackId: { name: "Multiple Snacks", nameMr: "अनेक स्नॅक्स" },
        };
      } else {
        const res = await api.get(`/api/snack-orders/validate/${parsed.orderId}`);
        order = res.data;
      }

      setValidationResult({
        qr: parsed,
        order,
      });
    } catch (err) {
      console.error("Snack QR validation failed:", err);
      const message =
        err?.response?.data?.message || t("qr_scanner_err_validate_failed");
      setErrorMessage(message);
      Alert.alert(t("qr_scanner_alert_validation_failed"), message);
    } finally {
      setValidating(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setValidationResult(null);
    setErrorMessage("");
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.infoText}>{t("qr_scanner_requesting_camera")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>{t("qr_scanner_camera_denied_title")}</Text>
          <Text style={styles.infoText}>
            {t("qr_scanner_camera_denied_body")}
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#111827" />
            <Text style={styles.secondaryButtonText}>{t("qr_scanner_go_back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const order = validationResult?.order;
  const qr = validationResult?.qr;

  const isMatch =
    order &&
    qr &&
    (qr.totalPrice == null ||
      Number(order.totalPrice || 0) === Number(qr.totalPrice || 0));

  const formatOrderDateTime = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return t("qr_scanner_na");
    return date.toLocaleString(language === "mr" ? "mr-IN" : "en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const na = t("qr_scanner_na");
  const qrTag = t("qr_scanner_from_qr");
  const splitMemberNamesFromQr = Array.isArray(qr?.splitMemberNames)
    ? qr.splitMemberNames
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    : [];
  const splitMemberNamesFromOrder = Array.isArray(order?.splitMembers)
    ? order.splitMembers
        .map((m) =>
          language === "mr"
            ? String(m?.nameMr || m?.name || "").trim()
            : String(m?.name || m?.nameMr || "").trim()
        )
        .filter(Boolean)
    : [];
  const splitMemberNames =
    splitMemberNamesFromOrder.length > 0
      ? splitMemberNamesFromOrder
      : splitMemberNamesFromQr;
  const memberDisplay =
    splitMemberNames.length > 0
      ? splitMemberNames.join(", ")
      : language === "mr"
      ? order?.studentId?.nameMr || order?.studentId?.name || qr?.memberName || na
      : order?.studentId?.name || qr?.memberName || na;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("qr_scanner_title")}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        <View style={styles.scannerWrapper}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.overlay}>
            <View style={styles.overlaySide} />
            <View style={styles.overlayCenter}>
              <View style={styles.scanBox} />
            </View>
            <View style={styles.overlaySide} />
          </View>
        </View>

        <Text style={styles.helperText}>{t("qr_scanner_helper")}</Text>

        {validating && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.statusText}>{t("qr_scanner_validating")}</Text>
          </View>
        )}

        {errorMessage ? (
          <View style={styles.resultCardError}>
            <Ionicons name="close-circle" size={22} color="#DC2626" />
            <Text style={styles.resultTextError}>{errorMessage}</Text>
          </View>
        ) : null}

        {order && (
          <View
            style={[
              styles.resultCard,
              isMatch ? styles.resultCardValid : styles.resultCardWarning,
            ]}
          >
            <View style={styles.resultHeader}>
              <Ionicons
                name={isMatch ? "checkmark-circle" : "alert-circle"}
                size={24}
                color={isMatch ? "#16A34A" : "#D97706"}
              />
              <Text
                style={[
                  styles.resultTitle,
                  isMatch ? styles.resultTitleValid : styles.resultTitleWarning,
                ]}
              >
                {isMatch ? t("qr_scanner_valid_title") : t("qr_scanner_mismatch_title")}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_member")}</Text>
              <Text style={styles.detailValue}>{memberDisplay}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_snack")}</Text>
              <Text style={styles.detailValue}>
                {language === "mr"
                  ? order.snackId?.nameMr ||
                    order.snackId?.name ||
                    qr?.snackName ||
                    na
                  : order.snackId?.name || qr?.snackName || na}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_quantity")}</Text>
              <Text style={styles.detailValue}>
                {order.quantity}
                {qr?.quantity
                  ? ` (${qrTag}: ${Number(qr.quantity) || qr.quantity})`
                  : ""}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_total")}</Text>
              <Text style={styles.detailValue}>
                ₹{Number(order.totalPrice || 0).toLocaleString("en-IN")}
                {qr?.totalPrice
                  ? ` (${qrTag}: ₹${Number(qr.totalPrice || 0).toLocaleString(
                      "en-IN"
                    )})`
                  : ""}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_order_date")}</Text>
              <Text style={styles.detailValue}>
                {order.date
                  ? formatOrderDateTime(order.date)
                  : qr?.orderDate
                  ? formatOrderDateTime(qr.orderDate)
                  : na}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("qr_scanner_label_reference")}</Text>
              <Text style={styles.detailValueMono}>{order._id}</Text>
            </View>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={resetScanner}
            activeOpacity={0.8}
          >
            <Ionicons name="scan" size={18} color="#111827" />
            <Text style={styles.secondaryButtonText}>
              {scanned ? t("qr_scanner_scan_again") : t("qr_scanner_ready")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  scannerWrapper: {
    height: 260,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  overlayCenter: {
    width: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  scanBox: {
    width: 200,
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FACC15",
    backgroundColor: "transparent",
  },
  helperText: {
    marginTop: 16,
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    color: "#111827",
  },
  resultCard: {
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  resultCardValid: {
    borderWidth: 1,
    borderColor: "#4ADE80",
  },
  resultCardWarning: {
    borderWidth: 1,
    borderColor: "#FBBF24",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  resultTitleValid: {
    color: "#166534",
  },
  resultTitleWarning: {
    color: "#92400E",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    maxWidth: "60%",
    textAlign: "right",
  },
  detailValueMono: {
    fontSize: 13,
    color: "#111827",
    fontFamily: "monospace",
    maxWidth: "65%",
    textAlign: "right",
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  infoText: {
    marginTop: 12,
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  resultCardError: {
    marginTop: 16,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultTextError: {
    fontSize: 14,
    color: "#B91C1C",
    flexShrink: 1,
  },
});

