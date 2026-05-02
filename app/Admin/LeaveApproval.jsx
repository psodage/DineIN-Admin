import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import { fetchMemberDirectory } from "../../lib/memberDirectory";

const STATUS_COLORS = {
  Pending: { bg: "#FEF3C7", text: "#92400E" },
  Approved: { bg: "#D1FAE5", text: "#065F46" },
  Rejected: { bg: "#FEE2E2", text: "#991B1B" },
};

const LeaveApproval = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();

  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [manualType, setManualType] = useState("Leave"); // Leave | Activation
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualEndDate, setManualEndDate] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/leave/all");
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
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      setMembersLoading(true);
      const rows = await fetchMemberDirectory(api);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to load members");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

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
      fetchMembers();
    }
  }, [authLoading, isAuthenticated, fetchLeaves, fetchMembers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchLeaves(), fetchMembers()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchLeaves, fetchMembers]);

  const filteredMembers = useMemo(() => {
    const q = String(memberQuery || "").trim().toLowerCase();
    if (!q) return members;
    return (members || []).filter((m) => {
      const en = String(m?.name || "").toLowerCase();
      const mr = String(m?.nameMr || "").toLowerCase();
      const phone = String(m?.phone || "").toLowerCase();
      return en.includes(q) || mr.includes(q) || phone.includes(q);
    });
  }, [members, memberQuery]);

  const resetManualForm = useCallback(() => {
    setMemberQuery("");
    setSelectedMember(null);
    setManualType("Leave");
    setManualStartDate("");
    setManualEndDate("");
    setManualSubmitting(false);
  }, []);

  const openManualModal = useCallback(() => {
    resetManualForm();
    setManualModalVisible(true);
  }, [resetManualForm]);

  const closeManualModal = useCallback(() => {
    setManualModalVisible(false);
    resetManualForm();
  }, [resetManualForm]);

  const isValidYmd = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

  const submitManualRequest = useCallback(async () => {
    if (manualSubmitting) return;
    if (!selectedMember?._id) {
      Alert.alert("Validation", "Please select member");
      return;
    }
    const type = manualType === "Activation" ? "Activation" : "Leave";
    const payload = { memberId: selectedMember._id, type };

    if (type === "Leave") {
      if (!isValidYmd(manualStartDate)) {
        Alert.alert("Validation", "Start date must be YYYY-MM-DD");
        return;
      }
      payload.startDate = manualStartDate.trim();
      if (String(manualEndDate || "").trim()) {
        if (!isValidYmd(manualEndDate)) {
          Alert.alert("Validation", "End date must be YYYY-MM-DD");
          return;
        }
        payload.endDate = manualEndDate.trim();
      }
    } else {
      if (!isValidYmd(manualEndDate)) {
        Alert.alert("Validation", "Activation date must be YYYY-MM-DD");
        return;
      }
      payload.endDate = manualEndDate.trim();
    }

    try {
      setManualSubmitting(true);
      const res = await api.post("/api/leave/admin/request", payload);
      const created = res?.data;
      if (created?._id) {
        setLeaves((prev) => [created, ...(prev || [])]);
      } else {
        await fetchLeaves();
      }
      closeManualModal();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to create request");
    } finally {
      setManualSubmitting(false);
    }
  }, [
    closeManualModal,
    fetchLeaves,
    manualEndDate,
    manualStartDate,
    manualSubmitting,
    manualType,
    selectedMember,
  ]);

  const updateStatus = async (id, status) => {
    try {
      setUpdatingId(id);
      const endpoint =
        status === "Approved"
          ? `/api/leave/approve/${id}`
          : `/api/leave/reject/${id}`;
      const res = await api.put(endpoint, {});

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
  const getMemberDisplayName = useCallback(
    (item) => {
      const unknownMemberText =
        language === "en" ? "Unknown Member" : "अज्ञात सदस्य";

      if (language === "mr") {
        return (
          item.studentNameMr ||
          item.memberNameMr ||
          item.memberId?.nameMr ||
          item.studentId?.nameMr ||
          item.memberName ||
          item.studentName ||
          item.memberId?.name ||
          item.studentId?.name ||
          unknownMemberText
        );
      }

      return (
        item.studentName ||
        item.memberName ||
        item.memberId?.name ||
        item.studentId?.name ||
        item.studentNameMr ||
        item.memberNameMr ||
        item.memberId?.nameMr ||
        item.studentId?.nameMr ||
        unknownMemberText
      );
    },
    [language]
  );

  const renderHistoryItem = ({ item }) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.Pending;
    const studentName = getMemberDisplayName(item);

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
    const studentName = getMemberDisplayName(item);

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
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {studentName}
            </Text>
            {isActivation && (
              <Text style={styles.cardTag}>
                {language === "en"
                  ? "Activation Request"
                  : "सदस्यता सक्रिय करण्याची विनंती"}
              </Text>
            )}
          </View>
          <View style={styles.cardHeaderRight}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusStyle.bg },
              ]}
            >
              <Text
                style={[styles.statusText, { color: statusStyle.text }]}
                numberOfLines={1}
              >
                {item.status}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.approveIconButton,
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
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
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
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={openManualModal}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setHistoryModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={22} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={pendingLeaves}
          keyExtractor={(item) => item._id}
          renderItem={renderLeaveItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {language === "en"
                  ? "No pending leave requests."
                  : "कोणत्याही प्रलंबित रजा विनंत्या नाहीत."}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={manualModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeManualModal}
      >
        <SafeAreaView style={styles.manualOverlay}>
          <View style={styles.manualSheet}>
            <View style={styles.manualHeader}>
              <Text style={styles.manualTitle}>
                {language === "en" ? "Manual Request" : "हस्तचलित विनंती"}
              </Text>
              <TouchableOpacity onPress={closeManualModal} style={styles.modalClose}>
                <Ionicons name="close" size={26} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.manualBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>
                {language === "en" ? "Member *" : "सदस्य *"}
              </Text>
              <TextInput
                style={styles.formInput}
                placeholder={
                  language === "en" ? "Search by name / phone" : "नाव / फोनने शोधा"
                }
                value={memberQuery}
                onChangeText={setMemberQuery}
                autoCapitalize="none"
              />

              <View style={styles.memberPickerBox}>
                {membersLoading ? (
                  <View style={styles.loadingMini}>
                    <ActivityIndicator size="small" color="#111827" />
                  </View>
                ) : (
                  (filteredMembers || []).slice(0, 20).map((m) => {
                    const active = selectedMember?._id === m._id;
                    return (
                      <TouchableOpacity
                        key={String(m._id)}
                        style={[styles.memberOption, active && styles.memberOptionActive]}
                        onPress={() => setSelectedMember(m)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.memberOptionText} numberOfLines={1}>
                          {language === "mr" ? m.nameMr || m.name : m.name || m.nameMr || "-"}
                        </Text>
                        <Text style={styles.memberOptionSub} numberOfLines={1}>
                          {String(m.phone || "").trim() ? m.phone : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <Text style={[styles.formLabel, { marginTop: 14 }]}>
                {language === "en" ? "Request Type *" : "विनंती प्रकार *"}
              </Text>
              <View style={styles.typeRow}>
                {["Leave", "Activation"].map((t) => {
                  const active = manualType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typePill, active && styles.typePillActive]}
                      onPress={() => setManualType(t)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {manualType === "Leave" ? (
                <>
                  <Text style={[styles.formLabel, { marginTop: 14 }]}>
                    {language === "en" ? "Start Date * (YYYY-MM-DD)" : "सुरू तारीख * (YYYY-MM-DD)"}
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="2026-05-01"
                    value={manualStartDate}
                    onChangeText={setManualStartDate}
                    autoCapitalize="none"
                  />
                  <Text style={[styles.formLabel, { marginTop: 14 }]}>
                    {language === "en"
                      ? "End Date (optional, YYYY-MM-DD)"
                      : "शेवटची तारीख (ऐच्छिक, YYYY-MM-DD)"}
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="2026-05-05"
                    value={manualEndDate}
                    onChangeText={setManualEndDate}
                    autoCapitalize="none"
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.formLabel, { marginTop: 14 }]}>
                    {language === "en"
                      ? "Activation Date * (YYYY-MM-DD)"
                      : "सक्रिय तारीख * (YYYY-MM-DD)"}
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="2026-05-01"
                    value={manualEndDate}
                    onChangeText={setManualEndDate}
                    autoCapitalize="none"
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, manualSubmitting && styles.submitBtnDisabled]}
                onPress={submitManualRequest}
                disabled={manualSubmitting}
                activeOpacity={0.85}
              >
                {manualSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {language === "en" ? "Create Request" : "विनंती तयार करा"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={historyModalVisible}
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <SafeAreaView style={styles.historyScreen}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>
              {language === "en" ? "Leave History" : "रजा इतिहास"}
            </Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setHistoryModalVisible(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={26} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#111827" />
            </View>
          ) : (
            <FlatList
              data={historyLeaves}
              keyExtractor={(item) => item._id}
              renderItem={renderHistoryItem}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={styles.historyListContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    {language === "en"
                      ? "No history found."
                      : "कोणताही इतिहास आढळला नाही."}
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </SafeAreaView>
      </Modal>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
  historyScreen: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  historyListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  cardHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
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
  approveIconButton: {
    marginLeft: 8,
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
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
  modalClose: { padding: 4 },

  manualOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  manualSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  manualHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  manualTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  manualBody: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  memberPickerBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    maxHeight: 260,
    overflow: "hidden",
  },
  loadingMini: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  memberOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  memberOptionActive: {
    backgroundColor: "#EEF2FF",
  },
  memberOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  memberOptionSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  typePillActive: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  typePillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  typePillTextActive: {
    color: "#FFFFFF",
  },
  submitBtn: {
    marginTop: 18,
    marginBottom: 24,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

