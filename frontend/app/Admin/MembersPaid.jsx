import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import { getMonthLabel } from "../../lib/monthLabels";

const formatCurrency = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

const parseMonthParamToYearMonth = (monthParam) => {
  const s = String(monthParam || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return year * 12 + monthIndex;
};

export default function MembersPaid() {
  const router = useRouter();
  const { month: monthParamRaw } = useLocalSearchParams();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();

  const monthParam = String(monthParamRaw || "").trim();
  const yearMonth = useMemo(
    () => parseMonthParamToYearMonth(monthParam),
    [monthParam]
  );

  const monthLabel = yearMonth != null ? getMonthLabel(yearMonth, language) : "";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchPaidMembers = useCallback(async () => {
    if (!monthParam) {
      setErrorMsg(
        language === "mr"
          ? "महिना पॅरामीटर गायब आहे"
          : "Month parameter is missing"
      );
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await api.get("/api/members/due-month", {
        params: { month: monthParam },
      });

      const rawMembers = Array.isArray(res?.data?.members)
        ? res.data.members
        : [];
      const paidMembers = rawMembers.filter(
        (m) =>
          Number(m?.totalBill || 0) > 0 && Number(m?.remainingAmount || 0) <= 0
      );
      setMembers(paidMembers);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        (language === "mr"
          ? "पेमेंट पूर्ण सदस्य लोड करता आले नाहीत"
          : "Failed to load paid members");
      setErrorMsg(message);
      setMembers([]);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  }, [monthParam, language]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!authLoading && isAuthenticated) fetchPaidMembers();
  }, [authLoading, isAuthenticated, fetchPaidMembers, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPaidMembers();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPaidMembers]);

  const filteredMembers = useMemo(() => {
    const q = (searchQuery || "").toLowerCase().trim();
    if (!q) return members;

    return members.filter((m) => {
      const name =
        language === "mr" ? m?.nameMr || m?.name || "" : m?.name || "";
      const roomOwnerName =
        language === "mr"
          ? m?.roomOwnerNameMr || m?.roomOwnerName || m?.roomNumber || ""
          : m?.roomOwnerName || m?.roomNumber || "";
      const rollNumber = m?.rollNumber || "";
      const status = m?.monthlyStatus || "";

      return (
        String(name).toLowerCase().includes(q) ||
        String(roomOwnerName).toLowerCase().includes(q) ||
        String(rollNumber).toLowerCase().includes(q) ||
        String(status).toLowerCase().includes(q)
      );
    });
  }, [members, searchQuery, language]);

  const renderMemberCard = ({ item }) => {
    const paid = Number(item?.paidAmount || 0);
    const totalBill = Number(item?.totalBill || 0);
    const displayName =
      language === "mr" ? item?.nameMr || item?.name : item?.name;
    const roomOwner =
      language === "mr"
        ? item?.roomOwnerNameMr || item?.roomOwnerName || item?.roomNumber
        : item?.roomOwnerName || item?.roomNumber;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={2}>
            {displayName || "Unknown"}
          </Text>
          <View style={[styles.badge, styles.badgePaid]}>
            <Text style={[styles.badgeText, styles.badgeTextPaid]}>
              {language === "mr" ? "पूर्ण" : "Paid"}
            </Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{language === "mr" ? "एकूण बिल:" : "Total bill:"}</Text>
          <Text style={styles.cardValue}>{formatCurrency(totalBill)}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{language === "mr" ? "भरलेले:" : "Paid:"}</Text>
          <Text style={styles.cardValue}>{formatCurrency(paid)}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>{language === "mr" ? "रोल:" : "Roll:"}</Text>
          <Text style={styles.cardValue}>{item?.rollNumber || "-"}</Text>
        </View>

        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>
            {language === "mr" ? "रूम मालक:" : "Room owner:"}
          </Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {roomOwner || "-"}
          </Text>
        </View>
      </View>
    );
  };

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
        <View style={styles.headerCenter}>
          <Text style={styles.title}>
            {language === "en" ? "Members Paid" : "पेमेंट पूर्ण सदस्य"}
          </Text>
          <Text style={styles.subtitle}>{monthLabel}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color="#9CA3AF"
          style={styles.searchIcon}
        />
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
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
        />
        {searchQuery ? (
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            style={styles.clearSearch}
            accessibilityLabel="Clear search"
          >
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
          data={filteredMembers}
          keyExtractor={(item) =>
            String(
              item?.memberId?._id ||
                item?.memberId ||
                item?._id ||
                item?.rollNumber ||
                ""
            )
          }
          renderItem={renderMemberCard}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {errorMsg
                  ? errorMsg
                  : language === "en"
                    ? `No paid members for ${monthLabel}.`
                    : `${monthLabel} साठी पेमेंट पूर्ण सदस्य नाहीत.`}
              </Text>
            </View>
          }
        />
      )}
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
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  headerRight: {
    width: 40,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    marginBottom: 12,
  },
  cardName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgePaid: {
    backgroundColor: "#D1FAE5",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextPaid: {
    color: "#065F46",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  cardLabel: {
    width: 120,
    fontSize: 14,
    color: "#6B7280",
  },
  cardValue: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
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
    textAlign: "center",
  },
});
