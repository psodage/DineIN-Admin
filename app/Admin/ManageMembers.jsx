import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { displayStatusMr } from "../../lib/memberLabelsMr";
import { fetchMemberDirectory } from "../../lib/memberDirectory";

const ManageMembers = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchMemberDirectory(api);
      setStudents(Array.isArray(rows) ? rows : []);
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err?.response?.data?.message || t("manage_members_alert_generic_error")
      );
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const res = await api.get("/api/pending-registrations");
      const rows = Array.isArray(res.data) ? res.data : [];
      setPendingApprovalCount(rows.length);
    } catch (err) {
      setPendingApprovalCount(0);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) fetchStudents();
  }, [authLoading, isAuthenticated, fetchStudents]);

  useEffect(() => {
    const q = (searchQuery || "").toLowerCase().trim();
    if (!q) {
      setFilteredStudents(students);
      return;
    }
    const filtered = students.filter((s) => {
      const name =
        language === "mr" ? s.nameMr || s.name || "" : s.name || "";
      const roomOwnerName =
        language === "mr"
          ? s.roomOwnerNameMr || s.roomOwnerName || s.roomNumber || ""
          : s.roomOwnerName || s.roomNumber || "";
      const rollNumber = s.rollNumber || "";

      return (
        name.toLowerCase().includes(q) ||
        roomOwnerName.toLowerCase().includes(q) ||
        rollNumber.toLowerCase().includes(q)
      );
    });
    setFilteredStudents(filtered);
  }, [searchQuery, students, language]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPendingApprovals();
    }
  }, [isAuthenticated, fetchPendingApprovals]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStudents(), fetchPendingApprovals()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudents, fetchPendingApprovals]);

  const openMemberDetails = (member) => {
    router.push({
      pathname: "/Admin/MemberDetails",
      params: { memberId: String(member._id) },
    });
  };

  const renderStudentCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => openMemberDetails(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={2}>
          {language === "mr" ? item.nameMr || item.name : item.name}
        </Text>
        <View style={styles.cardHeaderRight}>
          <View
            style={[
              styles.statusBadge,
              item.status === "Active" ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                item.status === "Active"
                  ? styles.statusTextActive
                  : styles.statusTextInactive,
              ]}
            >
              {displayStatusMr(
                language,
                item.status || "Active",
                item.statusMr
              )}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
      </View>
    </TouchableOpacity>
  );

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
          {language === "en" ? "Manage Members" : "सदस्य व्यवस्थापन"}
        </Text>
        <TouchableOpacity
          style={styles.headerApprovalButton}
          onPress={() => router.push("/Admin/MembersApproval")}
          activeOpacity={0.7}
          accessibilityLabel={
            language === "en" ? "Members approval" : "सदस्य मंजुरी"
          }
        >
          <Image
            source={require("../../assets/images/user.png")}
            style={styles.headerApprovalIconImage}
            resizeMode="contain"
          />
          {pendingApprovalCount > 0 ? (
            <View style={styles.headerApprovalBadge}>
              <Text style={styles.headerApprovalBadgeText}>
                {pendingApprovalCount > 9 ? "9+" : String(pendingApprovalCount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            language === "en"
              ? "Search by name, ID or room owner"
              : "नाव, आयडी किंवा रूम मालकाने शोधा"
          }
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item) => item._id}
          renderItem={renderStudentCard}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {searchQuery
                  ? language === "en"
                    ? "No members match your search"
                    : "तुमच्या शोधाशी जुळणारे सदस्य नाहीत"
                  : language === "en"
                  ? "No members found"
                  : "सदस्य आढळले नाहीत"}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

export default ManageMembers;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  headerApprovalButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerApprovalIconImage: {
    width: 35,
    height: 35,
  },
  headerApprovalBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  headerApprovalBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  approvalContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  approvalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  approvalCaption: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#6B7280",
  },
  approvalListContent: {
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  clearSearch: {
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
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
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: "#D1FAE5",
  },
  statusInactive: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusTextActive: {
    color: "#065F46",
  },
  statusTextInactive: {
    color: "#991B1B",
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

