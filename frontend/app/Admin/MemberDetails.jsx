import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import { displayMealPlanMr, displayStatusMr } from "../../lib/memberLabelsMr";
import {
  dateToYearMonth,
  getMaxSelectableYearMonth,
  getPolicyMinYearMonth,
  isBeforeJuneYearMonth,
  shiftMemberMonthDate,
  snapToJuneYearMonth,
  yearMonthToDate,
} from "../../lib/monthNavigation";

const formatDate = (value, fallback = "-") => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `Rs. ${amount.toFixed(2)}`;
};

const toDateOnlyLocal = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

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

const toSafeAmount = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

const isValidMonthDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

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
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calendarDayUpdatingKeys, setCalendarDayUpdatingKeys] = useState([]);
  const [monthlyDue, setMonthlyDue] = useState(0);
  const [totalMonthlyDue, setTotalMonthlyDue] = useState(0);
  const dueRefreshTimerRef = useRef(null);
  const latestMonthlyDueReqRef = useRef(0);
  const latestTotalDueReqRef = useRef(0);

  const [form, setForm] = useState({
    name: "",
    roomOwnerName: "",
    phone: "",
    email: "",
    joiningDate: "",
    status: "Active",
    mealPlan: "Lunch",
  });
  const [leaveDates, setLeaveDates] = useState([]);
  const [monthDate, setMonthDate] = useState(() =>
    normalizeMonthDate(new Date()) || new Date()
  );
  const [refreshing, setRefreshing] = useState(false);

  const memberIdValue = String(memberId || "").trim();
  const monthParam = useMemo(() => getMonthParam(monthDate), [monthDate]);
  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const leaveDateSet = useMemo(() => new Set(leaveDates), [leaveDates]);
  const policyMinMonth = useMemo(
    () => normalizeMonthDate(yearMonthToDate(getPolicyMinYearMonth())),
    []
  );
  const minMonth = useMemo(() => {
    const joinMin = normalizeMonthDate(member?.joiningDate || new Date());
    if (!joinMin) return policyMinMonth;
    if (!policyMinMonth) return joinMin;
    return joinMin > policyMinMonth ? joinMin : policyMinMonth;
  }, [member?.joiningDate, policyMinMonth]);
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
      const payload = res.data || null;
      setMember(payload);
      setForm({
        name: String(payload?.name || "").trim(),
        roomOwnerName: String(payload?.roomOwnerName || payload?.roomNumber || "").trim(),
        phone: String(payload?.phone || "").trim(),
        email: String(payload?.email || payload?.userId?.email || "").trim(),
        joiningDate: formatDate(payload?.joiningDate, ""),
        status: payload?.status === "Inactive" ? "Inactive" : "Active",
        mealPlan: ["Lunch", "Dinner", "Both"].includes(payload?.mealPlan)
          ? payload.mealPlan
          : "Lunch",
      });
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

  const fetchMonthlyDue = useCallback(async () => {
    if (!memberIdValue) return;
    const requestId = latestMonthlyDueReqRef.current + 1;
    latestMonthlyDueReqRef.current = requestId;
    try {
      const res = await api.get(`/api/members/${memberIdValue}/monthly-due`, {
        params: { month: monthParam },
      });
      if (latestMonthlyDueReqRef.current !== requestId) return;
      const payload = res?.data || {};
      setMonthlyDue(toSafeAmount(payload?.due, payload?.remainingForMonth, payload?.monthlyDue, 0));
    } catch (_err) {
      if (latestMonthlyDueReqRef.current !== requestId) return;
      setMonthlyDue(0);
    }
  }, [memberIdValue, monthParam]);

  const fetchTotalMonthlyDue = useCallback(async () => {
    if (!memberIdValue) return;
    const requestId = latestTotalDueReqRef.current + 1;
    latestTotalDueReqRef.current = requestId;
    try {
      const res = await api.get(`/api/members/${memberIdValue}/monthly-due-total`);
      if (latestTotalDueReqRef.current !== requestId) return;
      const payload = res?.data || {};
      setTotalMonthlyDue(toSafeAmount(payload?.totalDue, payload?.due, 0));
    } catch (_err) {
      if (latestTotalDueReqRef.current !== requestId) return;
      setTotalMonthlyDue(0);
    }
  }, [memberIdValue]);

  const scheduleDueRefresh = useCallback(() => {
    if (dueRefreshTimerRef.current) clearTimeout(dueRefreshTimerRef.current);
    dueRefreshTimerRef.current = setTimeout(() => {
      fetchMonthlyDue();
      fetchTotalMonthlyDue();
    }, 700);
  }, [fetchMonthlyDue, fetchTotalMonthlyDue]);

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
      fetchMonthlyDue();
      fetchTotalMonthlyDue();
    }
  }, [
    isAuthenticated,
    memberIdValue,
    fetchLeaveCalendar,
    fetchMonthlyDue,
    fetchTotalMonthlyDue,
  ]);

  useEffect(() => {
    if (!isValidMonthDate(monthDate)) {
      setMonthDate(maxMonth || new Date());
      return;
    }
    const currentYm = getMaxSelectableYearMonth();
    let ym = dateToYearMonth(monthDate);
    if (ym !== currentYm && isBeforeJuneYearMonth(ym)) {
      ym = snapToJuneYearMonth(ym);
    }
    let next = yearMonthToDate(ym);
    if (isValidMonthDate(minMonth) && next < minMonth) {
      next = minMonth;
    }
    if (isValidMonthDate(maxMonth) && next > maxMonth) {
      next = maxMonth;
    }
    if (next.getTime() !== monthDate.getTime()) {
      setMonthDate(next);
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
  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const onSave = async () => {
    const payload = {
      name: String(form.name || "").trim(),
      roomOwnerName: String(form.roomOwnerName || "").trim(),
      phone: String(form.phone || "").trim(),
      email: String(form.email || "").trim(),
      joiningDate: String(form.joiningDate || "").trim(),
      status: form.status === "Inactive" ? "Inactive" : "Active",
      mealPlan: ["Lunch", "Dinner", "Both"].includes(form.mealPlan)
        ? form.mealPlan
        : "Lunch",
    };
    if (!payload.name || !payload.roomOwnerName) {
      Alert.alert(
        language === "en" ? "Validation error" : "तपासणी त्रुटी",
        language === "en"
          ? "Name and room owner are required."
          : "नाव आणि रूम मालक आवश्यक आहेत."
      );
      return;
    }
    try {
      setSaving(true);
      await api.put(`/api/members/${memberIdValue}`, payload);
      setIsEditing(false);
      await Promise.all([
        fetchMemberDetails(),
        fetchLeaveCalendar(),
        fetchMonthlyDue(),
        fetchTotalMonthlyDue(),
      ]);
      Alert.alert(
        language === "en" ? "Updated" : "अपडेट झाले",
        language === "en"
          ? "Member details updated successfully."
          : "सदस्य तपशील यशस्वीरित्या अपडेट झाले."
      );
    } catch (err) {
      Alert.alert(
        language === "en" ? "Error" : "त्रुटी",
        err?.response?.data?.message ||
          (language === "en"
            ? "Failed to update member details."
            : "सदस्य तपशील अपडेट करता आले नाहीत.")
      );
    } finally {
      setSaving(false);
    }
  };
  const onCancelEdit = () => {
    setIsEditing(false);
    setForm({
      name: String(member?.name || "").trim(),
      roomOwnerName: String(member?.roomOwnerName || member?.roomNumber || "").trim(),
      phone: String(member?.phone || "").trim(),
      email: String(member?.email || member?.userId?.email || "").trim(),
      joiningDate: formatDate(member?.joiningDate, ""),
      status: member?.status === "Inactive" ? "Inactive" : "Active",
      mealPlan: ["Lunch", "Dinner", "Both"].includes(member?.mealPlan)
        ? member.mealPlan
        : "Lunch",
    });
  };
  const confirmDelete = () => {
    Alert.alert(
      language === "en" ? "Delete member?" : "सदस्य हटवायचा?",
      language === "en"
        ? "This action cannot be undone."
        : "ही क्रिया पूर्ववत करता येणार नाही.",
      [
        {
          text: language === "en" ? "Cancel" : "रद्द करा",
          style: "cancel",
        },
        {
          text: language === "en" ? "Delete" : "हटवा",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await api.delete(`/api/members/${memberIdValue}`);
              Alert.alert(
                language === "en" ? "Deleted" : "हटवले",
                language === "en"
                  ? "Member deleted successfully."
                  : "सदस्य यशस्वीरित्या हटवला."
              );
              router.replace("/Admin/ManageMembers");
            } catch (err) {
              Alert.alert(
                language === "en" ? "Error" : "त्रुटी",
                err?.response?.data?.message ||
                  (language === "en"
                    ? "Failed to delete member."
                    : "सदस्य हटवता आला नाही.")
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };
  const cellSize = useMemo(() => {
    const horizontalOuterPadding = 16 * 2;
    const cardInnerPadding = 16 * 2;
    const usableWidth = Math.max(screenWidth - horizontalOuterPadding - cardInnerPadding, 280);
    return Math.floor(usableWidth / 7);
  }, [screenWidth]);
  const onToggleCalendarDay = useCallback(
    async (dateKey, nextInactive) => {
      if (!dateKey) return;
      if (calendarDayUpdatingKeys.includes(dateKey)) return;
      const previous = leaveDates;
      setLeaveDates((prev) => {
        const set = new Set(prev || []);
        if (nextInactive) set.add(dateKey);
        else set.delete(dateKey);
        return Array.from(set).sort();
      });
      try {
        setCalendarDayUpdatingKeys((keys) => Array.from(new Set([...(keys || []), dateKey])));
        const res = await api.put(
          `/api/leave/member/${memberIdValue}/calendar-day`,
          { date: dateKey, inactive: nextInactive },
          { params: { fast: 1 } }
        );

        // If backend returns updated due/totalDue (non-fast), reflect immediately.
        if (Number.isFinite(Number(res?.data?.due))) setMonthlyDue(Number(res.data.due));
        if (Number.isFinite(Number(res?.data?.totalDue))) setTotalMonthlyDue(Number(res.data.totalDue));
        if (res?.data?.memberStatus) {
          const nextMemberStatus = res.data.memberStatus === "Inactive" ? "Inactive" : "Active";
          const nextMemberStatusMr = String(res?.data?.memberStatusMr || "").trim();
          setMember((prev) =>
            prev
              ? {
                  ...prev,
                  status: nextMemberStatus,
                  statusMr: nextMemberStatusMr || prev.statusMr || "",
                }
              : prev
          );
          setForm((prev) => ({ ...prev, status: nextMemberStatus }));
        }

        // Render tends to be slow; refresh totals shortly after last tap.
        scheduleDueRefresh();
      } catch (err) {
        setLeaveDates(previous);
        Alert.alert(
          language === "en" ? "Error" : "त्रुटी",
          err?.response?.data?.message ||
            (language === "en"
              ? "Failed to update calendar day."
              : "कॅलेंडर दिवस अपडेट करता आला नाही.")
        );
      } finally {
        setCalendarDayUpdatingKeys((keys) => (keys || []).filter((k) => k !== dateKey));
      }
    },
    [calendarDayUpdatingKeys, language, leaveDates, memberIdValue, scheduleDueRefresh]
  );

  const onRefresh = useCallback(async () => {
    if (!memberIdValue) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchMemberDetails(),
        fetchLeaveCalendar(),
        fetchMonthlyDue(),
        fetchTotalMonthlyDue(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    memberIdValue,
    fetchMemberDetails,
    fetchLeaveCalendar,
    fetchMonthlyDue,
    fetchTotalMonthlyDue,
  ]);

  useEffect(() => {
    return () => {
      if (dueRefreshTimerRef.current) clearTimeout(dueRefreshTimerRef.current);
    };
  }, []);

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
        <TouchableOpacity
          style={styles.headerActionButton}
          onPress={() => (isEditing ? onCancelEdit() : setIsEditing(true))}
          activeOpacity={0.7}
          disabled={saving || deleting}
        >
          <Ionicons
            name={isEditing ? "close-outline" : "create-outline"}
            size={20}
            color="#111827"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
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
            <Text style={styles.totalDueText}>
              {language === "en" ? "Total Due: " : "एकूण बाकी: "}
              {formatCurrency(totalMonthlyDue)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {language === "en" ? "Details" : "तपशील"}
          </Text>
          {isEditing ? (
            <View style={styles.editWrap}>
              <TextInput
                style={styles.input}
                placeholder={language === "en" ? "Member name" : "सदस्य नाव"}
                value={form.name}
                onChangeText={(v) => updateForm("name", v)}
              />
              <TextInput
                style={styles.input}
                placeholder={language === "en" ? "Room owner name" : "रूम मालक नाव"}
                value={form.roomOwnerName}
                onChangeText={(v) => updateForm("roomOwnerName", v)}
              />
              <TextInput
                style={styles.input}
                placeholder={language === "en" ? "Phone" : "फोन"}
                value={form.phone}
                onChangeText={(v) => updateForm("phone", v)}
                keyboardType="phone-pad"
              />
              <TextInput
                style={styles.input}
                placeholder={language === "en" ? "Email" : "ईमेल"}
                value={form.email}
                onChangeText={(v) => updateForm("email", v)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.readonlyInput]}
                placeholder={language === "en" ? "Joining date (YYYY-MM-DD)" : "जॉइनिंग तारीख (YYYY-MM-DD)"}
                value={form.joiningDate}
                editable={false}
              />
              <View style={styles.quickRow}>
                <TouchableOpacity style={[styles.pillButton, styles.readonlyPillButton]} disabled activeOpacity={1}>
                  <Text style={styles.pillButtonText}>
                    {(language === "en" ? "Meal Plan: " : "जेवण योजना: ") + form.mealPlan}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pillButton, styles.readonlyPillButton]} disabled activeOpacity={1}>
                  <Text style={styles.pillButtonText}>
                    {(language === "en" ? "Status: " : "स्थिती: ") + form.status}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.saveButton, saving && styles.actionDisabled]}
                  onPress={onSave}
                  disabled={saving || deleting}
                >
                  <Text style={styles.actionButtonText}>
                    {saving
                      ? language === "en"
                        ? "Saving..."
                        : "सेव्ह होत आहे..."
                      : language === "en"
                      ? "Save"
                      : "सेव्ह करा"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={onCancelEdit}
                  disabled={saving || deleting}
                >
                  <Text style={styles.actionButtonText}>
                    {language === "en" ? "Cancel" : "रद्द करा"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
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
                <Text style={styles.compactSeparator}>|</Text>
                <Text style={styles.compactText}>
                  {language === "en" ? "mealAmt" : "चार्ज केलेली रक्कम"}:{" "}
                  {formatCurrency(member?.mealPlanPrice)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deleteButton, deleting && styles.actionDisabled]}
                onPress={confirmDelete}
                disabled={deleting || saving}
              >
                <Text style={styles.deleteButtonText}>
                  {deleting
                    ? language === "en"
                      ? "Deleting..."
                      : "हटवत आहे..."
                    : language === "en"
                    ? "Delete Member"
                    : "सदस्य हटवा"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.calendarHeader}>
            <View>
              <Text style={styles.cardTitle}>
                {language === "en" ? "Activity Calendar" : "क्रियाकलाप कॅलेंडर"}
              </Text>
              <Text style={styles.monthDueText}>
                {language === "en" ? "Monthly Due: " : "मासिक बाकी: "}
                {formatCurrency(monthlyDue)}
              </Text>
            </View>
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={[styles.monthButton, !canGoPrev && styles.monthButtonDisabled]}
                onPress={() =>
                  setMonthDate((prev) => shiftMemberMonthDate(prev, -1, minMonth, maxMonth))
                }
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
                onPress={() =>
                  setMonthDate((prev) => shiftMemberMonthDate(prev, 1, minMonth, maxMonth))
                }
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
                const joinDate =
                  member?.joiningDate && !Number.isNaN(new Date(member.joiningDate).getTime())
                    ? toDateOnlyLocal(new Date(member.joiningDate))
                    : null;
                const isBeforeJoining =
                  joinDate && toDateOnlyLocal(cell).getTime() < joinDate.getTime();
                const isUpdatingCell = calendarDayUpdatingKeys.includes(dateKey);
                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[
                      styles.cell,
                      { width: cellSize, height: cellSize },
                      isLeave ? styles.inactiveDayCell : styles.activeDayCell,
                      isFuture && styles.futureDayCell,
                      isBeforeJoining && styles.beforeJoiningCell,
                      isUpdatingCell && styles.dayUpdatingCell,
                    ]}
                    disabled={!isEditing || isFuture || isBeforeJoining || isUpdatingCell}
                    onPress={() => onToggleCalendarDay(dateKey, !isLeave)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isLeave ? styles.inactiveDayText : styles.activeDayText,
                        isFuture && styles.futureDayText,
                        isBeforeJoining && styles.beforeJoiningText,
                      ]}
                    >
                      {cell.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <Text style={styles.legend}>
            {language === "en"
              ? isEditing
                ? "Edit mode: tap a day to toggle leave. Green = active, Red = leave."
                : "Green = active day, Red = inactive leave day."
              : isEditing
              ? "एडिट मोड: दिवसावर टॅप करून रजा बदला. हिरवा = सक्रिय, लाल = रजा."
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
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
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
  editWrap: {
    marginTop: 8,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  readonlyInput: {
    backgroundColor: "#F3F4F6",
    color: "#6B7280",
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
  },
  pillButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  readonlyPillButton: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  pillButtonText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveButton: {
    backgroundColor: "#16A34A",
  },
  cancelButton: {
    backgroundColor: "#6B7280",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  actionDisabled: {
    opacity: 0.7,
  },
  deleteButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    paddingVertical: 11,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
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
  beforeJoiningCell: {
    backgroundColor: "#F3F4F6",
  },
  dayUpdatingCell: {
    opacity: 0.6,
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
  beforeJoiningText: {
    color: "#9CA3AF",
    fontWeight: "600",
  },
  legend: {
    marginTop: 10,
    fontSize: 12,
    color: "#6B7280",
  },
  monthDueText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  totalDueText: {
    marginTop: 8,
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
});
