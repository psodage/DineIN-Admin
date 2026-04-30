import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import { getMonthLabel } from "../../lib/monthLabels";
import { fetchMemberDirectory } from "../../lib/memberDirectory";

const getSelectedMonth = (monthOffset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.getFullYear() * 12 + d.getMonth();
};

const formatCurrency = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

const formatDisplayDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const toYearMonthValue = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const Payments = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getSelectedMonth());
  const [members, setMembers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [totalDue, setTotalDue] = useState(0);
  const [dueMonths, setDueMonths] = useState([]);
  const [selectedDueMonth, setSelectedDueMonth] = useState(null);
  const [selectedMonthDue, setSelectedMonthDue] = useState(0);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [upiTransactionId, setUpiTransactionId] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState("");
  const submitLockRef = useRef(false);
  const [monthlySummary, setMonthlySummary] = useState({
    collected: 0,
    pending: 0,
    membersPaid: 0,
    remainingMembers: 0,
  });
  const [monthMemberBills, setMonthMemberBills] = useState([]);
  const [monthMemberBillsLoading, setMonthMemberBillsLoading] = useState(false);
  const [memberListSearch, setMemberListSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const selectedMonthParam = useMemo(() => {
    const year = Math.floor(selectedMonth / 12);
    const monthIndex = selectedMonth % 12;
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  }, [selectedMonth]);

  const getYearMonth = (date) =>
    date ? date.getFullYear() * 12 + date.getMonth() : null;

  const filteredMembers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const en = String(m?.name || "").toLowerCase();
      const mr = String(m?.nameMr || "").toLowerCase();
      return en.includes(q) || mr.includes(q);
    });
  }, [members, memberSearchQuery]);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/payments");
      const raw = Array.isArray(res.data) ? res.data : [];
      const normalized = raw.map((p) => ({
        ...p,
        studentId: p?.memberId?._id || p?.memberId || p?.studentId,
        studentName: p?.memberName || p?.memberId?.name || p?.studentName || "",
        studentNameMr:
          p?.memberNameMr ||
          p?.memberId?.nameMr ||
          p?.studentNameMr ||
          p?.memberId?.name ||
          "",
      }));
      setPayments(normalized);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to load payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const rows = await fetchMemberDirectory(api);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to load members");
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      fetchPayments();
      fetchMembers();
    }
  }, [authLoading, isAuthenticated, fetchPayments, fetchMembers, router]);

  const fetchMonthMemberBills = useCallback(async () => {
    try {
      setMonthMemberBillsLoading(true);
      const res = await api.get("/api/members/due-month", {
        params: { month: selectedMonthParam },
      });
      const rows = Array.isArray(res?.data?.members) ? res.data.members : [];
      setMonthMemberBills(rows);
      const totals = rows.reduce(
        (acc, row) => {
          const due = Number(
            row?.dueAmount ?? row?.due ?? row?.remainingAmount ?? row?.remainingForMonth ?? 0
          );
          const collected = Number(row?.paidAmount ?? row?.collected ?? 0);
          const totalBill = Math.max(0, Number(row?.totalBill ?? due + collected));
          const finalDue = Math.max(0, Math.max(0, due) - Math.max(0, collected));
          acc.collected += Math.max(0, collected);
          acc.pending += finalDue;
          if (totalBill > 0 && finalDue <= 0) acc.membersPaid += 1;
          if (totalBill > 0 && finalDue > 0) acc.remainingMembers += 1;
          return acc;
        },
        { collected: 0, pending: 0, membersPaid: 0, remainingMembers: 0 }
      );
      setMonthlySummary(totals);
    } catch (_err) {
      setMonthMemberBills([]);
      setMonthlySummary({
        collected: 0,
        pending: 0,
        membersPaid: 0,
        remainingMembers: 0,
      });
    } finally {
      setMonthMemberBillsLoading(false);
    }
  }, [selectedMonthParam]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await fetchMonthMemberBills();
      if (cancelled) return;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchMonthMemberBills]);

  const earliestPaymentMonth = (() => {
    let min = null;
    for (const p of payments) {
      const d = p.month ? new Date(p.month) : p.date ? new Date(p.date) : null;
      if (!d) continue;
      const ym = getYearMonth(d);
      if (!Number.isNaN(ym) && (min === null || ym < min)) {
        min = ym;
      }
    }
    return min;
  })();

  const minPaymentMonth =
    earliestPaymentMonth == null ? getSelectedMonth(0) : earliestPaymentMonth;

  const latestPaymentMonth = (() => {
    let max = null;
    for (const p of payments) {
      const d = p.month ? new Date(p.month) : p.date ? new Date(p.date) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const ym = getYearMonth(d);
      if (!Number.isNaN(ym) && (max === null || ym > max)) {
        max = ym;
      }
    }
    return max;
  })();

  useEffect(() => {
    if (latestPaymentMonth == null) return;
    const selectedHasPayments = payments.some((p) => {
      const d = p.month ? new Date(p.month) : p.date ? new Date(p.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return d.getFullYear() * 12 + d.getMonth() === selectedMonth;
    });
    if (!selectedHasPayments) {
      setSelectedMonth(latestPaymentMonth);
    }
  }, [latestPaymentMonth, payments, selectedMonth]);

  const monthPayments = payments
    .filter((p) => {
      const d = p.month ? new Date(p.month) : p.date ? new Date(p.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const ym = d.getFullYear() * 12 + d.getMonth();
      return ym === selectedMonth;
    })
    .slice()
    .sort((a, b) => {
      const an = (
        language === "mr" ? a.studentNameMr || a.studentName || "" : a.studentName || ""
      ).toLowerCase();
      const bn = (
        language === "mr" ? b.studentNameMr || b.studentName || "" : b.studentName || ""
      ).toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    });

  const billByMemberId = useMemo(() => {
    const map = new Map();
    for (const row of monthMemberBills || []) {
      const id = row?.memberId || row?._id;
      if (!id) continue;
      map.set(String(id), row);
    }
    return map;
  }, [monthMemberBills]);

  const monthMemberStatusRows = useMemo(() => {
    const resolveNumber = (value) => {
      if (value == null) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const rows = (members || []).map((m) => {
      const id = String(m?._id || "");
      const bill = billByMemberId.get(id);
      const dueRaw =
        bill && typeof bill === "object"
          ? resolveNumber(
              bill.dueAmount ?? bill.due ?? bill.remainingAmount ?? bill.remainingForMonth
            )
          : null;
      const collectedRaw =
        bill && typeof bill === "object"
          ? resolveNumber(bill.paidAmount ?? bill.collected)
          : null;
      const due =
        dueRaw == null && collectedRaw == null
          ? null
          : Math.max(0, Math.max(0, Number(dueRaw || 0)) - Math.max(0, Number(collectedRaw || 0)));
      const monthlyStatus =
        bill && due != null ? (due <= 0 ? "Paid" : "Pending") : "N/A";
      return {
        memberId: id,
        name: m?.name || "",
        nameMr: m?.nameMr || m?.name || "",
        phone: m?.phone || "",
        remainingAmount: due,
        monthlyStatus,
      };
    });
    const collator = new Intl.Collator("en", { sensitivity: "base" });
    rows.sort((a, b) =>
      collator.compare(
        String(language === "mr" ? a.nameMr || a.name : a.name || a.nameMr),
        String(language === "mr" ? b.nameMr || b.name : b.name || b.nameMr)
      )
    );
    return rows;
  }, [members, billByMemberId, language]);

  const filteredMonthMemberStatusRows = useMemo(() => {
    const q = String(memberListSearch || "").trim().toLowerCase();
    if (!q) return monthMemberStatusRows;
    return monthMemberStatusRows.filter((row) => {
      const nameEn = String(row?.name || "").toLowerCase();
      const nameMr = String(row?.nameMr || "").toLowerCase();
      const phone = String(row?.phone || "").toLowerCase();
      return nameEn.includes(q) || nameMr.includes(q) || phone.includes(q);
    });
  }, [monthMemberStatusRows, memberListSearch]);

  const renderMemberStatusCard = (row) => {
    const status = row.monthlyStatus;
    const due =
      row.remainingAmount == null ? null : Math.max(0, Number(row.remainingAmount || 0));
    const isPaid = status === "Paid";
    const isPending = status === "Pending";
    const canCall = String(row?.phone || "").trim().length > 0;
    const onCallPress = async () => {
      const phone = String(row?.phone || "").trim();
      if (!phone) {
        Alert.alert("Info", language === "en" ? "Phone not available" : "फोन उपलब्ध नाही");
        return;
      }
      const url = `tel:${phone}`;
      try {
        await Linking.openURL(url);
      } catch (_err) {
        Alert.alert(
          language === "en" ? "Call unavailable" : "कॉल उपलब्ध नाही",
          language === "en"
            ? `This device cannot place calls right now.\nNumber: ${phone}`
            : `या डिव्हाइसवर सध्या कॉल करता येत नाही.\nनंबर: ${phone}`
        );
      }
    };
    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderCompact}>
          <Text style={styles.cardName}>
            {language === "mr" ? row.nameMr || row.name || "Unknown" : row.name || "Unknown"}
          </Text>
          <View
            style={[
              styles.statusBadge,
              isPaid
                ? styles.statusPaid
                : isPending
                ? styles.statusPending
                : styles.statusUnknown,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isPaid
                  ? styles.statusTextPaid
                  : isPending
                  ? styles.statusTextPending
                  : styles.statusTextUnknown,
              ]}
            >
              {status}
            </Text>
          </View>
        </View>
        <View style={styles.cardAmountsRow}>
          <Text style={styles.amountText}>
            {language === "en" ? "Due" : "थकबाकी"}{" "}
            {due == null ? "-" : formatCurrency(due)}
          </Text>
          <TouchableOpacity
            style={[styles.callButton, !canCall && styles.callButtonDisabled]}
            onPress={onCallPress}
            disabled={!canCall}
            activeOpacity={0.8}
          >
            <Ionicons name="call-outline" size={14} color="#FFFFFF" />
            <Text style={styles.callButtonText}>{language === "en" ? "Call" : "कॉल"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPaymentCard = ({ item }) => {
    const paid = Number(item.paidAmount) || 0;
    const status = "Paid";
    const monthDate = new Date(item.month);
    const monthLabel = getMonthLabel(
      monthDate.getFullYear() * 12 + monthDate.getMonth(),
      language
    );

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderCompact}>
          <Text style={styles.cardName}>
            {language === "mr"
              ? item.studentNameMr || item.studentName || "Unknown"
              : item.studentName || "Unknown"}
          </Text>
          <View
            style={[
              styles.statusBadge,
              status === "Paid" ? styles.statusPaid : styles.statusPending,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                status === "Paid" ? styles.statusTextPaid : styles.statusTextPending,
              ]}
            >
              {status}
            </Text>
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          <Text style={styles.metaPill}>{monthLabel}</Text>
          <Text style={styles.metaPill}>{formatDisplayDate(item.date)}</Text>
          <Text style={styles.metaPill}>{item.paymentMethod || "Cash"}</Text>
        </View>
        <View style={styles.cardAmountsRow}>
          <Text style={styles.amountText}>Paid {formatCurrency(paid)}</Text>
          <TouchableOpacity
            style={[styles.deleteButton, deletingPaymentId === item._id && styles.deleteButtonDisabled]}
            onPress={() => handleDeletePayment(item)}
            disabled={deletingPaymentId === item._id}
            activeOpacity={0.8}
          >
            {deletingPaymentId === item._id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={14} color="#FFFFFF" />
                <Text style={styles.deleteButtonText}>
                  {language === "en" ? "Delete" : "हटवा"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const handleDeletePayment = (payment) => {
    if (!payment?._id) return;
    Alert.alert(
      language === "en" ? "Delete payment?" : "पेमेंट हटवायचे?",
      language === "en"
        ? "This payment entry will be removed and collected amount will be recalculated."
        : "ही पेमेंट नोंद हटवली जाईल आणि जमा रक्कम पुन्हा मोजली जाईल.",
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
              setDeletingPaymentId(String(payment._id));
              await api.delete(`/api/payments/${payment._id}`);
              await Promise.all([fetchPayments(), fetchMonthMemberBills()]);
            } catch (err) {
              Alert.alert(
                language === "en" ? "Error" : "त्रुटी",
                err?.response?.data?.message ||
                  (language === "en"
                    ? "Failed to delete payment"
                    : "पेमेंट हटवता आले नाही")
              );
            } finally {
              setDeletingPaymentId("");
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setMemberSearchQuery("");
    setSelectedMember(null);
    setTotalDue(0);
    setDueMonths([]);
    setSelectedDueMonth(null);
    setSelectedMonthDue(0);
    setPaidAmount("");
    setPaymentMethod("Cash");
    setUpiTransactionId("");
    setShowMemberPicker(false);
    setShowMonthPicker(false);
    setShowModePicker(false);
    setSubmitting(false);
    submitLockRef.current = false;
  };

  const openRecordModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const closeRecordModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const loadMemberDueInfo = useCallback(async (memberId) => {
    try {
      const [totalRes, monthsRes] = await Promise.all([
        api.get(`/api/members/${memberId}/monthly-due-total`),
        api.get(`/api/members/${memberId}/monthly-due-months`),
      ]);
      const months = Array.isArray(monthsRes?.data?.months) ? monthsRes.data.months : [];
      setTotalDue(Number(totalRes?.data?.totalDue || 0));
      setDueMonths(months);
      if (months.length > 0) {
        const firstMonth = months[0];
        setSelectedDueMonth(toYearMonthValue(firstMonth.month));
        setSelectedMonthDue(Number(firstMonth?.due || 0));
      } else {
        setSelectedDueMonth(null);
        setSelectedMonthDue(0);
      }
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to load due details");
      setTotalDue(0);
      setDueMonths([]);
      setSelectedDueMonth(null);
      setSelectedMonthDue(0);
    }
  }, []);

  const selectMember = async (member) => {
    setSelectedMember(member);
    setShowMemberPicker(false);
    await loadMemberDueInfo(member._id);
  };

  const selectDueMonth = async (monthValue) => {
    setSelectedDueMonth(monthValue);
    setShowMonthPicker(false);
    if (!selectedMember?._id || !monthValue) return;
    try {
      const res = await api.get(`/api/members/${selectedMember._id}/monthly-due`, {
        params: { month: monthValue },
      });
      setSelectedMonthDue(Number(res?.data?.due || 0));
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to load month due");
      setSelectedMonthDue(0);
    }
  };

  const paidAmountNumber = Number(paidAmount) || 0;
  const selectedMonthDueNumber = Number(selectedMonthDue) || 0;
  const dueAfterPayment = Math.max(0, Number(selectedMonthDue || 0) - paidAmountNumber);
  const isOverpay =
    String(paidAmount || "").trim().length > 0 && paidAmountNumber > selectedMonthDueNumber;

  const handleMarkPayment = async () => {
    if (submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    if (!selectedMember?._id) {
      Alert.alert("Validation", "Please select member");
      submitLockRef.current = false;
      return;
    }
    if (!selectedDueMonth) {
      Alert.alert("Validation", "Please select due month");
      submitLockRef.current = false;
      return;
    }
    if (!Number.isFinite(paidAmountNumber) || paidAmountNumber <= 0) {
      Alert.alert("Validation", "Please enter valid paid amount");
      submitLockRef.current = false;
      return;
    }
    if (paidAmountNumber > selectedMonthDueNumber) {
      Alert.alert(
        "Validation",
        `Paid amount cannot be greater than due amount (${formatCurrency(
          selectedMonthDueNumber
        )})`
      );
      submitLockRef.current = false;
      return;
    }
    if (paymentMethod === "UPI" && !String(upiTransactionId || "").trim()) {
      Alert.alert("Validation", "UPI transaction ID is required");
      submitLockRef.current = false;
      return;
    }
    try {
      setSubmitting(true);
      await api.post("/api/payments", {
        memberId: selectedMember._id,
        month: selectedDueMonth,
        paidAmount: paidAmountNumber,
        paymentMethod,
        upiTransactionId: paymentMethod === "UPI" ? String(upiTransactionId).trim() : "",
      });
      const paidMonthDate = new Date(selectedDueMonth);
      if (!Number.isNaN(paidMonthDate.getTime())) {
        setSelectedMonth(
          paidMonthDate.getFullYear() * 12 + paidMonthDate.getMonth()
        );
      }
      Alert.alert("Success", "Payment marked successfully");
      await Promise.all([fetchPayments(), loadMemberDueInfo(selectedMember._id)]);
      closeRecordModal();
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to mark payment");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchPayments(), fetchMembers(), fetchMonthMemberBills()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPayments, fetchMembers, fetchMonthMemberBills]);

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
          {language === "en" ? "Member Payments" : "सदस्य पेमेंट्स"}
        </Text>
        <TouchableOpacity
          style={styles.historyIconButton}
          onPress={() => setHistoryModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <TouchableOpacity
          style={styles.addButton}
          onPress={openRecordModal}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {language === "en" ? "Record Payment" : "पेमेंट नोंदवा"}
          </Text>
        </TouchableOpacity>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {language === "en"
                ? `Collected (${getMonthLabel(selectedMonth, language)})`
                : `प्राप्त (${getMonthLabel(selectedMonth, language)})`}
            </Text>
            <Text style={styles.summaryAmount}>
              {formatCurrency(monthlySummary.collected)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() =>
              router.push({
                pathname: "/Admin/RemainingMembers",
                params: { month: selectedMonthParam },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.summaryLabel}>
              {language === "en"
                ? `Pending (${getMonthLabel(selectedMonth, language)})`
                : `बाकी (${getMonthLabel(selectedMonth, language)})`}
            </Text>
            <Text style={[styles.summaryAmount, styles.pendingAmount]}>
              {formatCurrency(monthlySummary.pending)}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.summaryRow}>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() =>
              router.push({
                pathname: "/Admin/MembersPaid",
                params: { month: selectedMonthParam },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.summaryLabel}>
              {language === "en"
                ? `Members Paid (${getMonthLabel(selectedMonth, language)})`
                : `पेमेंट पूर्ण (${getMonthLabel(selectedMonth, language)})`}
            </Text>
            <Text style={styles.summaryAmount}>{monthlySummary.membersPaid}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() =>
              router.push({
                pathname: "/Admin/RemainingMembers",
                params: { month: selectedMonthParam },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.summaryLabel}>
              {language === "en"
                ? `Remaining Members (${getMonthLabel(selectedMonth, language)})`
                : `बाकी सदस्य (${getMonthLabel(selectedMonth, language)})`}
            </Text>
            <Text style={[styles.summaryAmount, styles.pendingAmount]}>
              {monthlySummary.remainingMembers}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() =>
              setSelectedMonth((m) => {
                const next = m - 1;
                return next < minPaymentMonth ? minPaymentMonth : next;
              })
            }
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{getMonthLabel(selectedMonth, language)}</Text>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() =>
              setSelectedMonth((m) => {
                const current = getSelectedMonth(0);
                const next = m + 1;
                return next > current ? current : next;
              })
            }
          >
            <Ionicons name="chevron-forward" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {language === "en"
              ? `Members (${getMonthLabel(selectedMonth, language)})`
              : `सदस्य (${getMonthLabel(selectedMonth, language)})`}
          </Text>
          <Text style={styles.sectionMeta}>
            {language === "en"
              ? `${monthMemberStatusRows.length} members`
              : `${monthMemberStatusRows.length} सदस्य`}
          </Text>
        </View>

        <View style={styles.memberSearchWrap}>
          <Ionicons name="search-outline" size={18} color="#6B7280" />
          <TextInput
            style={styles.memberSearchInput}
            placeholder={
              language === "en" ? "Search member by name or phone" : "नाव किंवा फोनने सदस्य शोधा"
            }
            value={memberListSearch}
            onChangeText={setMemberListSearch}
            autoCapitalize="none"
          />
          {memberListSearch ? (
            <TouchableOpacity onPress={() => setMemberListSearch("")} style={styles.searchClearBtn}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.listContent}>
          {monthMemberBillsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#111827" />
            </View>
          ) : (
            filteredMonthMemberStatusRows.map((row) => (
              <View key={String(row.memberId)}>{renderMemberStatusCard(row)}</View>
            ))
          )}

          {!monthMemberBillsLoading && filteredMonthMemberStatusRows.length === 0 ? (
            <View style={styles.emptyInlineContainer}>
              <Ionicons name="card-outline" size={52} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {language === "en"
                  ? "No members found."
                  : "सदस्य सापडले नाहीत."}
              </Text>
            </View>
          ) : null}
        </View>

      </ScrollView>

      <Modal
        visible={historyModalVisible}
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <SafeAreaView style={styles.historyScreen}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>
              {language === "en" ? "Payment History" : "पेमेंट इतिहास"}
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
              data={payments}
              keyExtractor={(item) => item._id}
              renderItem={renderPaymentCard}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={styles.historyListContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="card-outline" size={64} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    {language === "en"
                      ? "No payment records available."
                      : "पेमेंट नोंदी उपलब्ध नाहीत."}
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeRecordModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {language === "en" ? "Record Payment" : "पेमेंट नोंदवा"}
              </Text>
              <TouchableOpacity onPress={closeRecordModal} style={styles.modalClose}>
                <Ionicons name="close" size={26} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formScroll}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Member Name *" : "सदस्याचे नाव *"}
                </Text>
                <TouchableOpacity
                  style={styles.pickerInput}
                  onPress={() => setShowMemberPicker((p) => !p)}
                >
                  <Text style={selectedMember ? styles.pickerText : styles.placeholderText}>
                    {selectedMember
                      ? language === "mr"
                        ? selectedMember.nameMr || selectedMember.name
                        : selectedMember.name
                      : language === "en"
                      ? "Select member"
                      : "सदस्य निवडा"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
                {showMemberPicker && (
                  <View style={styles.pickerOptions}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder={language === "en" ? "Search member name" : "सदस्य नाव शोधा"}
                      value={memberSearchQuery}
                      onChangeText={setMemberSearchQuery}
                    />
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      style={styles.pickerList}
                    >
                      {filteredMembers.map((m) => (
                        <TouchableOpacity
                          key={String(m._id)}
                          style={styles.pickerOption}
                          onPress={() => selectMember(m)}
                        >
                          <Text style={styles.pickerOptionText}>
                            {language === "mr" ? m.nameMr || m.name || "-" : m.name || "-"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {filteredMembers.length === 0 ? (
                        <Text style={styles.emptyPickerText}>
                          {language === "en" ? "No members found" : "सदस्य सापडले नाहीत"}
                        </Text>
                      ) : null}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Total Due (All Months)" : "एकूण थकबाकी"}
                </Text>
                <View style={styles.valueBox}>
                  <Text style={styles.valueText}>{formatCurrency(totalDue)}</Text>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>{language === "en" ? "Month *" : "महिना *"}</Text>
                <TouchableOpacity
                  style={styles.pickerInput}
                  onPress={() => setShowMonthPicker((p) => !p)}
                >
                  <Text style={selectedDueMonth ? styles.pickerText : styles.placeholderText}>
                    {selectedDueMonth
                      ? (() => {
                          const d = new Date(selectedDueMonth);
                          return getMonthLabel(d.getFullYear() * 12 + d.getMonth(), language);
                        })()
                      : language === "en"
                      ? "Select due month"
                      : "थकबाकी महिना निवडा"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
                {showMonthPicker && (
                  <View style={styles.pickerOptions}>
                    {dueMonths.map((m) => (
                      <TouchableOpacity
                        key={String(m.month)}
                        style={styles.pickerOption}
                        onPress={() => selectDueMonth(toYearMonthValue(m.month))}
                      >
                        <Text style={styles.pickerOptionText}>
                          {(() => {
                            const d = new Date(m.month);
                            return `${getMonthLabel(d.getFullYear() * 12 + d.getMonth(), language)} (${formatCurrency(m.due)})`;
                          })()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {dueMonths.length === 0 && (
                      <Text style={styles.emptyPickerText}>
                        {language === "en" ? "No due months available" : "थकबाकी महिने उपलब्ध नाहीत"}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Due Amount (Selected Month)" : "निवडलेल्या महिन्याची थकबाकी"}
                </Text>
                <View style={styles.valueBox}>
                  <Text style={styles.valueText}>{formatCurrency(selectedMonthDue)}</Text>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Paid Amount *" : "भरलेली रक्कम *"}
                </Text>
                <TextInput
                  style={[styles.formInput, isOverpay && styles.formInputError]}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  keyboardType="decimal-pad"
                  placeholder={language === "en" ? "e.g. 500" : "उदा. ५००"}
                />
                {isOverpay ? (
                  <Text style={styles.formErrorText}>
                    {language === "en"
                      ? `Amount must be ≤ ${formatCurrency(selectedMonthDueNumber)}`
                      : `रक्कम ${formatCurrency(selectedMonthDueNumber)} पेक्षा जास्त नसावी`}
                  </Text>
                ) : null}
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Due After This Payment" : "या पेमेंटनंतरची थकबाकी"}
                </Text>
                <View style={styles.valueBox}>
                  <Text style={styles.valueText}>{formatCurrency(dueAfterPayment)}</Text>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {language === "en" ? "Payment Mode" : "पेमेंट पद्धत"}
                </Text>
                <TouchableOpacity
                  style={styles.pickerInput}
                  onPress={() => setShowModePicker((p) => !p)}
                >
                  <Text style={styles.pickerText}>{paymentMethod}</Text>
                  <Ionicons name="chevron-down" size={18} color="#6B7280" />
                </TouchableOpacity>
                {showModePicker && (
                  <View style={styles.pickerOptions}>
                    {["Cash", "UPI"].map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        style={styles.pickerOption}
                        onPress={() => {
                          setPaymentMethod(mode);
                          if (mode !== "UPI") setUpiTransactionId("");
                          setShowModePicker(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{mode}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {paymentMethod === "UPI" && (
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>
                    {language === "en" ? "UPI Transaction ID *" : "UPI व्यवहार आयडी *"}
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={upiTransactionId}
                    onChangeText={setUpiTransactionId}
                    placeholder={
                      language === "en" ? "Enter UPI transaction ID" : "UPI व्यवहार आयडी टाका"
                    }
                    autoCapitalize="none"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleMarkPayment}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {language === "en" ? "Mark Payment" : "पेमेंट नोंदवा"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

export default Payments;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  loadingContainer: {
    paddingVertical: 60,
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
  backButton: { padding: 8 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  historyIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  pendingAmount: {
    color: "#DC2626",
  },
  listContent: {
    paddingBottom: 12,
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
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 12,
  },
  monthNavButton: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  sectionHeaderRow: {
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  memberSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeaderCompact: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPaid: {
    backgroundColor: "#D1FAE5",
  },
  statusPending: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusTextPaid: {
    color: "#065F46",
  },
  statusTextPending: {
    color: "#991B1B",
  },
  statusUnknown: {
    backgroundColor: "#E5E7EB",
  },
  statusTextUnknown: {
    color: "#374151",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  metaPill: {
    fontSize: 12,
    color: "#374151",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cardAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  amountText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  remainingRed: {
    color: "#DC2626",
    fontWeight: "600",
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  callButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  callButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 74,
    justifyContent: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyInlineContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 16,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  modalClose: { padding: 4 },
  formScroll: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  formField: {
    marginBottom: 14,
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
    fontSize: 16,
    color: "#111827",
  },
  formInputError: {
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  formErrorText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  pickerInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerText: {
    fontSize: 16,
    color: "#111827",
  },
  placeholderText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  pickerOptions: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    maxHeight: 220,
  },
  pickerList: {
    maxHeight: 160,
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pickerOptionText: {
    fontSize: 15,
    color: "#111827",
  },
  searchInput: {
    margin: 10,
    marginBottom: 4,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  emptyPickerText: {
    padding: 14,
    color: "#6B7280",
    fontSize: 14,
  },
  valueBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  valueText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "700",
  },
  submitButton: {
    marginTop: 12,
    marginBottom: 30,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

