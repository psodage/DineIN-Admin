import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";

const STATUS_COLORS = {
  Pending: { bg: "#FEF3C7", text: "#92400E" },
  Approved: { bg: "#D1FAE5", text: "#065F46" },
  Rejected: { bg: "#FEE2E2", text: "#991B1B" },
};

const LeaveApproval = () => {
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();

  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const getAuthHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : {};

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/leave/all`, {
        headers: getAuthHeaders(),
      });
      setLeaves(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Fetch leaves error:", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to load leave requests"
      );
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleCall = (phone) => {
    if (!phone) {
      Alert.alert(
        language === "en" ? "No phone number" : "फोन नंबर उपलब्ध नाही",
        language === "en"
          ? "This member does not have a phone number saved."
          : "या सदस्याचा फोन नंबर जतन केलेला नाही."
      );
      return;
    }
    const cleanPhone = String(phone).trim();
    const url = `tel:${cleanPhone}`;
    Linking.openURL(url).catch(() => {
      Alert.alert(
        language === "en" ? "Unable to call" : "कॉल करता आला नाही",
        language === "en"
          ? "Could not open the dialer on this device."
          : "या डिव्हाइसवर डायलर उघडू शकलो नाही."
      );
    });
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      fetchLeaves();
    }
  }, [authLoading, isAuthenticated, fetchLeaves]);

  const updateStatus = async (id, status) => {
    try {
      setUpdatingId(id);
      const endpoint =
        status === "Approved"
          ? `${API_BASE_URL}/api/leave/approve/${id}`
          : `${API_BASE_URL}/api/leave/reject/${id}`;

      const res = await axios.put(
        endpoint,
        {},
        {
          headers: getAuthHeaders(),
        }
      );

      setLeaves((prev) =>
        prev.map((l) => (l._id === id ? { ...l, status: res.data.status } : l))
      );
    } catch (error) {
      console.error("Update leave status error:", error);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to update leave status"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "Pending");
  const historyLeaves = leaves.filter((l) => l.status !== "Pending");

  const renderHistoryItem = ({ item }) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.Pending;
    const unknownMemberText =
      language === "en" ? "Unknown Member" : "अज्ञात सदस्य";
    const studentName =
      language === "mr"
        ? item.studentNameMr ||
          item.memberId?.nameMr ||
          item.studentId?.nameMr ||
          unknownMemberText
        : item.studentName ||
          item.memberId?.name ||
          item.studentId?.name ||
          unknownMemberText;

    const inactiveDays = Number(item.currentInactiveDays || 0);
    const isChargeableLeave = inactiveDays > 0;
    const isInactiveAccount =
      item.memberId?.status === "Inactive" ||
      item.studentId?.status === "Inactive";
    const isActivation = item.type === "Activation";

    const startDate = item.startDate
      ? new Date(item.startDate).toISOString().split("T")[0]
      : "-";
    const endDate = item.endDate ? new Date(item.endDate).toISOString().split("T")[0] : "-";

    const requestLabel =
      item.type === "Activation"
        ? language === "en"
          ? "Activation request"
          : "सदस्यता सक्रिय करण्याची विनंती"
        : language === "en"
        ? "Leave request"
        : "रजा विनंती";

    return (
      <View style={styles.historyCard}>
        <View style={styles.historyHeaderRow}>
          <Text style={styles.historyName}>{studentName}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg, alignSelf: "flex-start" },
            ]}
          >
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.historyReason}>
          {language === "en" ? "Reason" : "कारण"}: {requestLabel}
        </Text>
        {isInactiveAccount && (
          <Text style={styles.historyInactiveInfo}>
            {language === "en"
              ? `Inactive days this month: ${inactiveDays} / 5`
              : `या महिन्यात निष्क्रिय दिवस: ${inactiveDays} / 5`}
          </Text>
        )}

        {!isActivation && (
          <>
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
              <Text
                style={[
                  styles.rowLabel,
                  isChargeableLeave && styles.rowLabelGreen,
                ]}
              >
                {language === "en" ? "From" : "पासून"}:
              </Text>
              <Text
                style={[
                  styles.rowValue,
                  isChargeableLeave && styles.rowValueGreen,
                ]}
              >
                {startDate}
              </Text>
            </View>

            {isChargeableLeave && (
              <View style={styles.row}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color="#065F46"
                />
                <Text
                  style={[
                    styles.rowLabel,
                    isChargeableLeave && styles.rowLabelGreen,
                  ]}
                >
                  {language === "en" ? "To" : "पर्यंत"}:
                </Text>
                <Text
                  style={[
                    styles.rowValue,
                    isChargeableLeave && styles.rowValueGreen,
                  ]}
                >
                  {endDate}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const renderLeaveItem = ({ item }) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.Pending;
    const unknownMemberText =
      language === "en" ? "Unknown Member" : "अज्ञात सदस्य";
    const studentName =
      language === "mr"
        ? item.studentNameMr ||
          item.memberId?.nameMr ||
          item.studentId?.nameMr ||
          unknownMemberText
        : item.studentName ||
          item.memberId?.name ||
          item.studentId?.name ||
          unknownMemberText;
    const roomNumber =
      language === "mr"
        ? item.memberId?.roomOwnerNameMr ||
          item.studentId?.roomOwnerNameMr ||
          item.memberId?.roomOwnerName ||
          item.studentId?.roomOwnerName ||
          item.roomNumber ||
          (language === "en" ? "N/A" : "उपलब्ध नाही")
        : item.roomNumber ||
          item.memberId?.roomOwnerName ||
          item.memberId?.roomNumber ||
          item.studentId?.roomOwnerName ||
          item.studentId?.roomNumber ||
          (language === "en" ? "N/A" : "उपलब्ध नाही");

    const phone = item.memberId?.phone || item.studentId?.phone;

    const isActivation = item.type === "Activation";

    const inactiveDays = Number(item.currentInactiveDays || 0);
    const isChargeableLeave = inactiveDays > 0;
    const isInactiveAccount =
      item.memberId?.status === "Inactive" ||
      item.studentId?.status === "Inactive";

    const startDate = item.startDate
      ? new Date(item.startDate).toISOString().split("T")[0]
      : "-";
    const endDate = item.endDate
      ? new Date(item.endDate).toISOString().split("T")[0]
      : "-";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{studentName}</Text>
            <Text style={styles.cardSubtitle}>
              {language === "en" ? "Room Owner" : "रूम मालक"}: {roomNumber}
            </Text>
            {isActivation && (
              <Text style={styles.cardTag}>
                {language === "en"
                  ? "Activation Request"
                  : "सदस्यता सक्रिय करण्याची विनंती"}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg },
            ]}
          >
            <Text
              style={[styles.statusText, { color: statusStyle.text }]}
            >
              {item.status}
            </Text>
          </View>
        </View>

        {isInactiveAccount && (
          <View style={styles.row}>
            <Ionicons name="time-outline" size={16} color="#6B7280" />
            <Text style={styles.rowLabel}>
              {language === "en"
                ? "Inactive days this month:"
                : "या महिन्यात निष्क्रिय दिवस:"}
            </Text>
            <Text style={styles.rowValue}>
              {inactiveDays} / 5
            </Text>
          </View>
        )}

        {!isActivation && (
          <>
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={16} color="#6B7280" />
              <Text style={styles.rowLabel}>
                {language === "en" ? "From" : "पासून"}:
              </Text>
                  <Text
                    style={[
                      styles.rowValue,
                      isChargeableLeave && styles.rowValueGreen,
                    ]}
                  >
                    {startDate}
                  </Text>
            </View>
                {isChargeableLeave && (
                  <View style={styles.row}>
                    <Ionicons name="calendar-outline" size={16} color="#065F46" />
                    <Text
                      style={[
                        styles.rowLabel,
                        isChargeableLeave && styles.rowLabelGreen,
                      ]}
                    >
                      {language === "en" ? "To" : "पर्यंत"}:
                    </Text>
                    <Text
                      style={[
                        styles.rowValue,
                        isChargeableLeave && styles.rowValueGreen,
                      ]}
                    >
                      {endDate}
                    </Text>
                  </View>
                )}
          </>
        )}
        {!!(language === "mr" ? item.reasonMr || item.reason : item.reason) && (
          <View style={styles.row}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#6B7280" />
            <Text style={styles.rowLabel}>
              {language === "en" ? "Reason" : "कारण"}:
            </Text>
            <Text style={styles.rowValue} numberOfLines={3}>
              {language === "mr" ? item.reasonMr || item.reason : item.reason}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton]}
            onPress={() => handleCall(phone)}
            activeOpacity={0.8}
          >
            <Ionicons name="call-outline" size={18} color="#FFFFFF" />
            <Text style={styles.actionText}>
              {language === "en" ? "Call" : "कॉल करा"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.approveButton,
              (item.status === "Approved" || updatingId === item._id) &&
                styles.actionButtonDisabled,
            ]}
            onPress={() => updateStatus(item._id, "Approved")}
            disabled={item.status === "Approved" || updatingId === item._id}
            activeOpacity={0.8}
          >
            {updatingId === item._id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>
                  {language === "en" ? "Approve" : "मंजूर करा"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.rejectButton,
              (item.status === "Rejected" || updatingId === item._id) &&
                styles.actionButtonDisabled,
            ]}
            onPress={() => updateStatus(item._id, "Rejected")}
            disabled={item.status === "Rejected" || updatingId === item._id}
            activeOpacity={0.8}
          >
            {updatingId === item._id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                <Text style={styles.actionText}>
                  {language === "en" ? "Reject" : "नाकार करा"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (authLoading || !isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </View>
    );
  }

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
        <Text style={styles.title}>
          {language === "en" ? "Leave Approvals" : "रजा मंजुरी"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <SectionList
          sections={[
            {
              key: "pending",
              title: language === "en" ? "Pending" : "प्रलंबित",
              data: pendingLeaves,
              emptyText:
                language === "en"
                  ? "No pending leave requests."
                  : "कोणत्याही प्रलंबित रजा विनंत्या नाहीत.",
              showWhenEmpty: true,
            },
            {
              key: "history",
              title: language === "en" ? "History" : "इतिहास",
              data: historyLeaves,
              showWhenEmpty: false,
            },
          ]}
          keyExtractor={(item) => item._id}
          renderItem={({ item, section }) =>
            section.key === "history"
              ? renderHistoryItem({ item })
              : renderLeaveItem({ item })
          }
          renderSectionHeader={({ section }) =>
            section.data.length > 0 || section.showWhenEmpty ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {language === "en"
                  ? "No leave requests."
                  : "कोणत्याही रजा विनंत्या नाहीत."}
              </Text>
            </View>
          }
          ListHeaderComponent={null}
          ListFooterComponent={
            pendingLeaves.length === 0 ? (
              <View style={styles.sectionEmptyBox}>
                <Text style={styles.sectionEmptyText}>
                  {language === "en"
                    ? "No pending leave requests."
                    : "कोणत्याही प्रलंबित रजा विनंत्या नाहीत."}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      )}
    </SafeAreaView>
  );
};

export default LeaveApproval;

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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 100,
  },
  sectionHeader: {
    backgroundColor: "#F3F4F6",
    paddingTop: 10,
    paddingBottom: 8,
    marginTop: 8,
    marginBottom: 10,
    zIndex: 10,
    elevation: 2,
  },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  cardTag: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  rowLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: "#6B7280",
  },
  rowLabelGreen: {
    color: "#065F46",
  },
  rowValue: {
    marginLeft: 4,
    fontSize: 14,
    color: "#111827",
    flexShrink: 1,
  },
  rowValueGreen: {
    color: "#065F46",
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    marginTop: 14,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveButton: {
    backgroundColor: "#16A34A",
  },
  rejectButton: {
    backgroundColor: "#DC2626",
  },
  callButton: {
    backgroundColor: "#0EA5E9",
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 16,
  },
  sectionEmptyBox: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionEmptyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  historyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  historyName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  historyReason: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  historyInactiveInfo: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
});

