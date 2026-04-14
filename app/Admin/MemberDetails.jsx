import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import { displayMealPlanMr, displayStatusMr } from "../../lib/memberLabelsMr";

const formatDate = (value, fallback = "-") => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
};

const getMonthParam = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const normalizeMonthDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

const isValidMonthDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

const shiftMonthSafe = (baseMonth, offset, minMonth, maxMonth) => {
  if (!isValidMonthDate(baseMonth)) return maxMonth || new Date();
  const moved = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1);
  if (isValidMonthDate(minMonth) && moved < minMonth) return minMonth;
  if (isValidMonthDate(maxMonth) && moved > maxMonth) return maxMonth;
  return moved;
};

const buildCalendarCells = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = firstDay.getDay();
  const cells = [];

  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export default function MemberDetails() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [member, setMember] = useState(null);
  const [leaveDates, setLeaveDates] = useState([]);
  const [monthDate, setMonthDate] = useState(() =>
    normalizeMonthDate(new Date()) || new Date()
  );

  const memberIdValue = String(memberId || "").trim();
  const monthParam = useMemo(() => getMonthParam(monthDate), [monthDate]);
  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const leaveDateSet = useMemo(() => new Set(leaveDates), [leaveDates]);
  const minMonth = useMemo(
    () => normalizeMonthDate(member?.joiningDate || new Date()),
    [member?.joiningDate]
  );
  const maxMonth = useMemo(() => normalizeMonthDate(new Date()), []);

  const fetchMemberDetails = useCallback(async () => {
    if (!memberIdValue) {
      setLoading(false);
      Alert.alert("Error", language === "en" ? "Member not found" : "सदस्य सापडला नाही");
      return;
    }
    try {
      setLoading(true);
      const res = await api.get(`/api/members/${memberIdValue}`);
      setMember(res.data || null);
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message ||
          (language === "en"
            ? "Failed to load member details"
            : "सदस्य तपशील लोड करता आला नाही")
      );
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, [memberIdValue, language]);

  const fetchLeaveCalendar = useCallback(async () => {
    if (!memberIdValue) return;
    try {
      setCalendarLoading(true);
      const res = await api.get(`/api/leave/member/${memberIdValue}`, {
        params: { month: monthParam },
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      const normalized = rows
        .map((row) => String(row?.date || "").slice(0, 10))
        .filter(Boolean);
      setLeaveDates(normalized);
    } catch (err) {
      setLeaveDates([]);
      Alert.alert(
        "Error",
        err?.response?.data?.message ||
          (language === "en"
            ? "Failed to load activity calendar"
            : "क्रियाकलाप कॅलेंडर लोड करता आले नाही")
      );
    } finally {
      setCalendarLoading(false);
    }
  }, [memberIdValue, monthParam, language]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) fetchMemberDetails();
  }, [authLoading, isAuthenticated, fetchMemberDetails, router]);

  useEffect(() => {
    if (isAuthenticated && memberIdValue) {
      fetchLeaveCalendar();
    }
  }, [isAuthenticated, memberIdValue, fetchLeaveCalendar]);

  useEffect(() => {
    if (!isValidMonthDate(monthDate)) {
      setMonthDate(maxMonth || new Date());
      return;
    }
    if (isValidMonthDate(minMonth) && monthDate < minMonth) {
      setMonthDate(minMonth);
      return;
    }
    if (isValidMonthDate(maxMonth) && monthDate > maxMonth) {
      setMonthDate(maxMonth);
    }
  }, [monthDate, minMonth, maxMonth]);

  const title =
    language === "mr"
      ? member?.nameMr || member?.name || "सदस्य तपशील"
      : member?.name || member?.nameMr || "Member Details";
  const roomOwner =
    language === "mr"
      ? member?.roomOwnerNameMr || member?.roomOwnerName || member?.roomNumber || "-"
      : member?.roomOwnerName || member?.roomOwnerNameMr || member?.roomNumber || "-";
  const monthLabel = monthDate.toLocaleDateString(
    language === "mr" ? "mr-IN" : "en-IN",
    { month: "long", year: "numeric" }
  );
  const canGoPrev = !minMonth || monthDate > minMonth;
  const canGoNext = !maxMonth || monthDate < maxMonth;
  const cellSize = useMemo(() => {
    const horizontalOuterPadding = 16 * 2;
    const cardInnerPadding = 16 * 2;
    const usableWidth = Math.max(screenWidth - horizontalOuterPadding - cardInnerPadding, 280);
    return Math.floor(usableWidth / 7);
  }, [screenWidth]);

  if (authLoading || !isAuthenticated || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
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
        <Text style={styles.title} numberOfLines={1}>
          {language === "en" ? "Member Profile" : "सदस्य प्रोफाइल"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={22} color="#111827" />
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName} numberOfLines={1}>
              {title}
            </Text>
            <View
              style={[
                styles.statusBadge,
                member?.status === "Inactive" ? styles.badgeInactive : styles.badgeActive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  member?.status === "Inactive"
                    ? styles.badgeInactiveText
                    : styles.badgeActiveText,
                ]}
              >
                {displayStatusMr(language, member?.status || "Active", member?.statusMr)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {language === "en" ? "Details" : "तपशील"}
          </Text>
          <View style={styles.compactLine}>
            <Text style={styles.compactText}>
              {language === "en" ? "Room Owner" : "रूम मालक"}: {roomOwner}
            </Text>
            <Text style={styles.compactSeparator}>|</Text>
            <Text style={styles.compactText}>
              {language === "en" ? "Meal Plan" : "जेवण योजना"}:{" "}
              {displayMealPlanMr(language, member?.mealPlan || "Lunch", member?.mealPlanMr)}
            </Text>
          </View>
          <View style={styles.compactLine}>
            <Text style={styles.compactText}>
              {language === "en" ? "Phone" : "फोन"}: {member?.phone || "-"}
            </Text>
            <Text style={styles.compactSeparator}>|</Text>
            <Text style={styles.compactText}>
              {language === "en" ? "Joining Date" : "जॉइनिंग तारीख"}:{" "}
              {formatDate(member?.joiningDate)}
            </Text>
          </View>
          <View style={styles.compactLine}>
            <Text style={styles.compactText}>
              {language === "en" ? "Email" : "ईमेल"}:{" "}
              {member?.email || member?.userId?.email || "-"}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.calendarHeader}>
            <Text style={styles.cardTitle}>
              {language === "en" ? "Activity Calendar" : "क्रियाकलाप कॅलेंडर"}
            </Text>
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={[styles.monthButton, !canGoPrev && styles.monthButtonDisabled]}
                onPress={() => setMonthDate((prev) => shiftMonthSafe(prev, -1, minMonth, maxMonth))}
                disabled={!canGoPrev}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={canGoPrev ? "#111827" : "#9CA3AF"}
                />
              </TouchableOpacity>
              <Text style={styles.monthText}>{monthLabel}</Text>
              <TouchableOpacity
                style={[styles.monthButton, !canGoNext && styles.monthButtonDisabled]}
                onPress={() => setMonthDate((prev) => shiftMonthSafe(prev, 1, minMonth, maxMonth))}
                disabled={!canGoNext}
              >
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={canGoNext ? "#111827" : "#9CA3AF"}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <Text key={`${d}-${idx}`} style={styles.weekText}>
                {d}
              </Text>
            ))}
          </View>

          {calendarLoading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator size="small" color="#111827" />
            </View>
          ) : (
            <View style={styles.grid}>
              {calendarCells.map((cell, idx) => {
                if (!cell) {
                  return (
                    <View
                      key={`empty-${idx}`}
                      style={[styles.cell, { width: cellSize, height: cellSize }]}
                    />
                  );
                }
                const dateKey = formatDate(cell, "");
                const isLeave = leaveDateSet.has(dateKey);
                const isFuture = cell > new Date();
                return (
                  <View
                    key={dateKey}
                    style={[
                      styles.cell,
                      { width: cellSize, height: cellSize },
                      isLeave ? styles.inactiveDayCell : styles.activeDayCell,
                      isFuture && styles.futureDayCell,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isLeave ? styles.inactiveDayText : styles.activeDayText,
                        isFuture && styles.futureDayText,
                      ]}
                    >
                      {cell.getDate()}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <Text style={styles.legend}>
            {language === "en"
              ? "Green = active day, Red = inactive leave day."
              : "हिरवा = सक्रिय दिवस, लाल = निष्क्रिय रजा दिवस."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  headerRight: {
    width: 40,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
    gap: 12,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  profileTextWrap: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeActive: {
    backgroundColor: "#DCFCE7",
  },
  badgeInactive: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeActiveText: {
    color: "#166534",
  },
  badgeInactiveText: {
    color: "#991B1B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  itemLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  itemValue: {
    color: "#111827",
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
    marginLeft: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  compactLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 6,
  },
  compactText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  compactSeparator: {
    marginHorizontal: 8,
    color: "#9CA3AF",
    fontWeight: "700",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  monthButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthButtonDisabled: {
    backgroundColor: "#F9FAFB",
  },
  monthText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  calendarLoading: {
    paddingVertical: 16,
    alignItems: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  activeDayCell: {
    backgroundColor: "#DCFCE7",
  },
  inactiveDayCell: {
    backgroundColor: "#FEE2E2",
  },
  futureDayCell: {
    backgroundColor: "#F9FAFB",
  },
  cellText: {
    fontSize: 12,
    color: "#374151",
  },
  activeDayText: {
    color: "#166534",
    fontWeight: "700",
  },
  inactiveDayText: {
    color: "#991B1B",
    fontWeight: "700",
  },
  futureDayText: {
    color: "#9CA3AF",
    fontWeight: "500",
  },
  legend: {
    marginTop: 10,
    fontSize: 12,
    color: "#6B7280",
  },
});
