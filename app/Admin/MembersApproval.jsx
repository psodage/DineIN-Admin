import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";

const MembersApproval = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();

  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingApprovalId, setUpdatingApprovalId] = useState(null);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/pending-registrations");
      const rows = Array.isArray(res.data) ? res.data : [];
      setPendingApprovals(rows);
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err?.response?.data?.message ||
          (language === "en"
            ? "Failed to load pending member approvals"
            : "प्रलंबित सदस्य मंजुरी लोड करता आली नाही")
      );
      setPendingApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [language, t]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      fetchPendingApprovals();
    }
  }, [authLoading, isAuthenticated, router, fetchPendingApprovals]);

  const updateApprovalStatus = async (pendingId, status) => {
    try {
      setUpdatingApprovalId(pendingId);
      const endpoint =
        status === "Approved"
          ? `/api/pending-registrations/approve/${pendingId}`
          : `/api/pending-registrations/reject/${pendingId}`;
      await api.put(endpoint, {});
      setPendingApprovals((prev) => prev.filter((item) => item._id !== pendingId));
      Alert.alert(
        t("alert_success"),
        status === "Approved"
          ? language === "en"
            ? "Member request approved"
            : "सदस्य विनंती मंजूर केली"
          : language === "en"
            ? "Member request rejected"
            : "सदस्य विनंती नाकारली"
      );
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err?.response?.data?.message ||
          (language === "en"
            ? "Failed to update member approval"
            : "सदस्य मंजुरी अपडेट करता आली नाही")
      );
    } finally {
      setUpdatingApprovalId(null);
    }
  };

  const renderApprovalCard = ({ item }) => {
    const name =
      language === "mr" ? item?.nameMr || item?.name : item?.name || item?.nameMr;

    const roomOwnerName =
      language === "mr"
        ? item?.roomOwnerNameMr || item?.roomOwnerName
        : item?.roomOwnerName || item?.roomOwnerNameMr;

    return (
      <View style={styles.approvalCard}>
        <View style={styles.approvalHeader}>
          <Text style={styles.approvalName}>
            {name || (language === "en" ? "Unknown Member" : "अज्ञात सदस्य")}
          </Text>
          <View style={styles.approvalPendingBadge}>
            <Text style={styles.approvalPendingBadgeText}>
              {language === "en" ? "Pending" : "प्रलंबित"}
            </Text>
          </View>
        </View>
        <Text style={styles.approvalSubText}>
          {language === "en" ? "Room Owner" : "रूम मालक"}:{" "}
          {roomOwnerName || (language === "en" ? "N/A" : "उपलब्ध नाही")}
        </Text>
        <Text style={styles.approvalSubText}>
          {language === "en" ? "Phone" : "फोन"}:{" "}
          {item?.phone || (language === "en" ? "N/A" : "उपलब्ध नाही")}
        </Text>
        <Text style={styles.approvalSubText}>
          {language === "en" ? "Meal Plan" : "जेवण योजना"}:{" "}
          {item?.mealPlan || (language === "en" ? "N/A" : "उपलब्ध नाही")}
        </Text>
        <Text style={styles.approvalSubText}>
          {language === "en" ? "Email" : "ईमेल"}:{" "}
          {item?.email || (language === "en" ? "N/A" : "उपलब्ध नाही")}
        </Text>
        <View style={styles.approvalActions}>
          <TouchableOpacity
            style={[
              styles.approvalActionButton,
              styles.approvalApproveButton,
              updatingApprovalId === item._id && styles.approvalActionButtonDisabled,
            ]}
            onPress={() => updateApprovalStatus(item._id, "Approved")}
            disabled={updatingApprovalId === item._id}
            activeOpacity={0.8}
          >
            {updatingApprovalId === item._id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                
                <Text style={styles.approvalActionText}>
                  {language === "en" ? "Approve" : "मंजूर करा"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.approvalActionButton,
              styles.approvalRejectButton,
              updatingApprovalId === item._id && styles.approvalActionButtonDisabled,
            ]}
            onPress={() => updateApprovalStatus(item._id, "Rejected")}
            disabled={updatingApprovalId === item._id}
            activeOpacity={0.8}
          >
            {updatingApprovalId === item._id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
              
                <Text style={styles.approvalActionText}>
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
          {language === "en" ? "Members Approval" : "सदस्य मंजुरी"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        <Text style={styles.caption}>
          {language === "en"
            ? "Pending member registrations"
            : "सदस्यांच्या प्रलंबित नोंदणी विनंत्या"}
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : (
          <FlatList
            data={pendingApprovals}
            keyExtractor={(item) => item._id}
            renderItem={renderApprovalCard}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="checkmark-done-circle-outline"
                  size={64}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  {language === "en"
                    ? "No pending member approvals."
                    : "प्रलंबित सदस्य मंजुरी नाही."}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

export default MembersApproval;

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
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  caption: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#6B7280",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: 100,
  },
  approvalCard: {
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
  approvalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  approvalName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  approvalPendingBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  approvalPendingBadgeText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  approvalSubText: {
    marginTop: 8,
    fontSize: 14,
    color: "#4B5563",
  },
  approvalActions: {
    flexDirection: "row",
    marginTop: 14,
    gap: 10,
  },
  approvalActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approvalApproveButton: {
    backgroundColor: "#16A34A",
  },
  approvalRejectButton: {
    backgroundColor: "#DC2626",
  },
  approvalActionButtonDisabled: {
    opacity: 0.7,
  },
  approvalActionText: {
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
});
