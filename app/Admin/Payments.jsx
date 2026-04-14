import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { getMonthLabel, buildMonthOptionList } from "../../lib/monthLabels";
import { fetchMemberDirectory } from "../../lib/memberDirectory";

const getSelectedMonth = (monthOffset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.getFullYear() * 12 + d.getMonth();
};

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer"];

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

const INITIAL_FORM = {
  studentId: "",
  studentName: "",
  totalMessFee: "",
  month: new Date().toISOString().split("T")[0].slice(0, 7) + "-01",
  paidAmount: "",
  paymentMethod: "Cash",
  date: new Date(),
};

const Payments = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [payments, setPayments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editingOriginalPaidAmount, setEditingOriginalPaidAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPaymentMethodPicker, setShowPaymentMethodPicker] = useState(false);
  const [errors, setErrors] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(getSelectedMonth());

  const selectedMonthParam = useMemo(() => {
    const year = Math.floor(selectedMonth / 12);
    const monthIndex = selectedMonth % 12;
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  }, [selectedMonth]);

  const monthOptions = useMemo(() => buildMonthOptionList(language), [language]);

  const getYearMonth = (date) =>
    date ? date.getFullYear() * 12 + date.getMonth() : null;

  const selectedStudent =
    members.find((s) => s._id === formData.studentId) ||
    members.find(
      (s) =>
        s.name?.trim().toLowerCase() ===
        formData.studentName?.trim().toLowerCase()
    );

  const [dueInfo, setDueInfo] = useState(null);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueError, setDueError] = useState("");

  const formMonthYearMonth = useMemo(() => {
    if (!formData?.month) return null;
    const d = new Date(formData.month);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear() * 12 + d.getMonth();
  }, [formData?.month]);

  const selectedStudentMonthPayments = useMemo(() => {
    if (!selectedStudent?._id || formMonthYearMonth == null) return [];
    return payments.filter((p) => {
      const memberId = p?.studentId;
      if (!memberId || String(memberId) !== String(selectedStudent._id)) return false;
      const d = p?.month ? new Date(p.month) : p?.date ? new Date(p.date) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      const ym = d.getFullYear() * 12 + d.getMonth();
      return ym === formMonthYearMonth;
    });
  }, [payments, selectedStudent?._id, formMonthYearMonth]);

  const dueComputation = useMemo(() => {
    if (!selectedStudent?._id || formMonthYearMonth == null) return null;
    const alreadyPaidRaw = selectedStudentMonthPayments.reduce(
      (sum, p) => sum + (Number(p?.paidAmount) || 0),
      0
    );
    const latestForMonth = [...selectedStudentMonthPayments].sort((a, b) => {
      const ad = a?.date ? new Date(a.date).getTime() : 0;
      const bd = b?.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    })[0];
    const totalBillFromHistory = Number(latestForMonth?.totalBill);
    const totalBillFromForm = Number(formData?.totalMessFee);
    const totalBill = Number.isFinite(totalBillFromHistory) && totalBillFromHistory > 0
      ? totalBillFromHistory
      : Number.isFinite(totalBillFromForm) && totalBillFromForm > 0
      ? totalBillFromForm
      : 0;
    const alreadyPaidBeforeCurrentEdit = Math.max(
      0,
      alreadyPaidRaw - (editingId ? oldPaid : 0)
    );
    const remainingForMonth = Math.max(0, totalBill - alreadyPaidBeforeCurrentEdit);
    return { remainingForMonth };
  }, [
    selectedStudent?._id,
    formMonthYearMonth,
    selectedStudentMonthPayments,
    formData?.totalMessFee,
    editingId,
    oldPaid,
  ]);

  useEffect(() => {
    setDueError("");
    setDueLoading(false);
    setDueInfo(dueComputation);
  }, [dueComputation]);

  // "Current Due" should be the due amount for the selected month only.
  const previousDue = dueInfo?.remainingForMonth ?? null;

  const paidNow = Number(formData.paidAmount) || 0;
  const oldPaid = editingOriginalPaidAmount || 0;
  const deltaPaid = paidNow - oldPaid;

  const predictedDue =
    previousDue != null
      ? Math.max(0, previousDue - deltaPaid)
      : null;

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/payments");
      const raw = Array.isArray(res.data) ? res.data : [];
      // Backward-compat: normalize member-facing fields to the old `studentId/studentName` names.
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
  }, [authLoading, isAuthenticated, fetchPayments, fetchMembers]);

  // No client-side filtering; admin UI lists the month data directly.

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

  const joiningYearMonth = selectedStudent?.joiningDate
    ? getYearMonth(new Date(selectedStudent.joiningDate))
    : null;

  const filteredMonthOptionsForForm =
    joiningYearMonth == null
      ? monthOptions
      : monthOptions.filter((opt) => opt.yearMonth >= joiningYearMonth);

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

  const monthSummaryTotals = useMemo(() => {
    const memberLatest = new Map();
    for (const p of monthPayments) {
      const memberId = p?.studentId ? String(p.studentId) : "";
      if (!memberId) continue;
      const currentTs = p?.date ? new Date(p.date).getTime() : 0;
      const previous = memberLatest.get(memberId);
      const prevTs = previous?.date ? new Date(previous.date).getTime() : -1;
      if (!previous || currentTs >= prevTs) {
        memberLatest.set(memberId, p);
      }
    }
    const latestRows = Array.from(memberLatest.values());
    return {
      collected: monthPayments.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0),
      pending: latestRows.reduce(
        (sum, p) => sum + Math.max(0, Number(p.remainingAmount) || 0),
        0
      ),
      membersPaid: latestRows.filter((p) => (Number(p.remainingAmount) || 0) <= 0).length,
      remainingMembers: latestRows.filter((p) => (Number(p.remainingAmount) || 0) > 0).length,
    };
  }, [monthPayments]);

  const openAddModal = () => {
    setEditingId(null);
    setEditingOriginalPaidAmount(0);
    setFormData({
      ...INITIAL_FORM,
      date: new Date(),
      month: new Date().toISOString().split("T")[0].slice(0, 7) + "-01",
    });
    setErrors({});
    setModalVisible(true);
  };

  const openEditModal = (payment) => {
    setEditingId(payment._id);
    setEditingOriginalPaidAmount(Number(payment.paidAmount) || 0);
    const monthDate = new Date(payment.month);
    const monthStr =
      monthDate.getFullYear() +
      "-" +
      String(monthDate.getMonth() + 1).padStart(2, "0") +
      "-01";
    setFormData({
      // `/api/payments` normalizes `studentId` to an ObjectId/string already.
      // Do not assume `studentId` is a populated object here.
      studentId: payment.studentId || "",
      studentName:
        language === "mr"
          ? payment.studentNameMr || payment.studentName || payment.studentId?.nameMr || payment.studentId?.name || ""
          : payment.studentName || payment.studentId?.name || "",
      totalMessFee: String(payment.totalMessFee || 0),
      month: monthStr,
      paidAmount: String(payment.paidAmount || 0),
      paymentMethod: payment.paymentMethod || "Cash",
      date: payment.date ? new Date(payment.date) : new Date(),
    });
    setErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setEditingOriginalPaidAmount(0);
    setFormData(INITIAL_FORM);
    setShowStudentPicker(false);
    setShowMonthPicker(false);
    setShowDatePicker(false);
    setShowPaymentMethodPicker(false);
  };

  const validate = () => {
    const e = {};
    if (!formData.studentName?.trim()) e.studentName = "Student is required";

    if (!formData.month) {
      e.month = "Month is required";
    } else {
      if (joiningYearMonth != null) {
        const mDate = new Date(formData.month);
        const formYm = getYearMonth(mDate);
        if (formYm != null && formYm < joiningYearMonth) {
          e.month = "Month cannot be before member joining month";
        }
      }
    }

    const total = Number(formData.totalMessFee);
    if (isNaN(total) || total <= 0)
      e.totalMessFee = "Enter valid total mess fee";
    const paid = Number(formData.paidAmount);
    if (isNaN(paid) || paid < 0) e.paidAmount = "Enter valid paid amount";
    if (!formData.date) e.date = "Payment date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      setSubmitting(true);
      const payload = {
        studentId: formData.studentId || undefined,
        studentName: formData.studentName.trim(),
        month: formData.month + "T00:00:00.000Z",
        totalMessFee: Number(formData.totalMessFee),
        paidAmount: Number(formData.paidAmount),
        paymentMethod: formData.paymentMethod,
        date: formData.date.toISOString(),
      };
      if (editingId) {
        await api.put(`/api/payments/${editingId}`, payload);
        Alert.alert("Success", "Payment updated successfully");
      } else {
        await api.post("/api/payments", payload);
        Alert.alert("Success", "Payment recorded successfully");
      }
      closeModal();
      fetchPayments();
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (payment) => {
    const displayName =
      language === "mr"
        ? payment.studentNameMr || payment.studentName
        : payment.studentName;
    Alert.alert(
      "Delete Payment",
      `Are you sure you want to delete the payment record for ${displayName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/payments/${payment._id}`);
              Alert.alert("Success", "Payment deleted successfully");
              fetchPayments();
            } catch (err) {
              Alert.alert(
                "Error",
                err?.response?.data?.message || "Failed to delete payment"
              );
            }
          },
        },
      ]
    );
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate) setFormData((f) => ({ ...f, date: selectedDate }));
  };

  const selectStudent = (s) => {
    const mealPlan = (s.mealPlan || "").toLowerCase();
    let totalMessFee = "";

    if (typeof s.totalMessFee === "number") {
      totalMessFee = String(s.totalMessFee);
    } else if (mealPlan === "lunch" || mealPlan === "dinner") {
      totalMessFee = "1500";
    } else if (mealPlan === "both") {
      totalMessFee = "3000";
    }

    setFormData((f) => {
      let nextMonth = f.month;

      if (s.joiningDate) {
        const joinDate = new Date(s.joiningDate);
        const joinYm = getYearMonth(joinDate);

        const currentMonthDate = nextMonth ? new Date(nextMonth) : new Date();
        const currentYm = getYearMonth(currentMonthDate);

        if (
          joinYm != null &&
          currentYm != null &&
          currentYm < joinYm
        ) {
          const joinOpt = monthOptions.find((opt) => opt.yearMonth === joinYm);
          if (joinOpt) {
            nextMonth = joinOpt.value;
          } else {
            const y = joinDate.getFullYear();
            const m = String(joinDate.getMonth() + 1).padStart(2, "0");
            nextMonth = `${y}-${m}-01`;
          }
        }
      }

      return {
        ...f,
        studentId: s._id,
        studentName:
          language === "mr" ? s.nameMr || s.name || "" : s.name || "",
        totalMessFee,
        month: nextMonth,
      };
    });
    setShowStudentPicker(false);
    setErrors((e) => ({ ...e, studentName: null }));
  };

  const selectMonth = (opt) => {
    if (joiningYearMonth != null && opt.yearMonth < joiningYearMonth) {
      Alert.alert(
        "Invalid month",
        "Month cannot be before member joining month"
      );
      return;
    }
    setFormData((f) => ({ ...f, month: opt.value }));
    setShowMonthPicker(false);
    setErrors((e) => ({ ...e, month: null }));
  };

  const selectPaymentMethod = (method) => {
    setFormData((f) => ({ ...f, paymentMethod: method }));
    setShowPaymentMethodPicker(false);
  };

  const renderPaymentCard = ({ item }) => {
    const paid = Number(item.paidAmount) || 0;
    const remaining = Number(item.remainingAmount) || 0;
    const status = remaining <= 0 ? "Paid" : "Pending";
    const monthDate = new Date(item.month);
    const monthLabel = getMonthLabel(
      monthDate.getFullYear() * 12 + monthDate.getMonth(),
      language
    );

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
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
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Month:</Text>
          <Text style={styles.cardValue}>{monthLabel}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Paid:</Text>
          <Text style={styles.cardValue}>{formatCurrency(paid)}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Remaining:</Text>
          <Text
            style={[
              styles.cardValue,
              remaining > 0 && styles.remainingRed,
            ]}
          >
            {formatCurrency(remaining)}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Date:</Text>
          <Text style={styles.cardValue}>{formatDisplayDate(item.date)}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Method:</Text>
          <Text style={styles.cardValue}>{item.paymentMethod || "Cash"}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFormField = (label, children, errorKey) => (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
      {errors[errorKey] ? (
        <Text style={styles.errorText}>{errors[errorKey]}</Text>
      ) : null}
    </View>
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
          {language === "en" ? "Member Payments" : "सदस्य पेमेंट्स"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
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
              {formatCurrency(monthSummaryTotals.collected)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {language === "en"
                ? `Pending (${getMonthLabel(selectedMonth, language)})`
                : `बाकी (${getMonthLabel(selectedMonth, language)})`}
            </Text>
            <Text style={[styles.summaryAmount, styles.pendingAmount]}>
              {formatCurrency(monthSummaryTotals.pending)}
            </Text>
          </View>
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
            <Text style={styles.summaryAmount}>
              {monthSummaryTotals.membersPaid}
            </Text>
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
              {monthSummaryTotals.remainingMembers}
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

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                {language === "en"
                  ? `History (${monthPayments.length})`
                  : `इतिहास (${monthPayments.length})`}
              </Text>
            </View>
            <FlatList
              data={monthPayments}
              keyExtractor={(item) => item._id}
              renderItem={renderPaymentCard}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="card-outline" size={64} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    {language === "en"
                      ? `No payments for ${getMonthLabel(selectedMonth, language)}. Record one!`
                      : `${getMonthLabel(selectedMonth, language)} साठी कोणतीही पेमेंट नोंद नाही. नवी नोंद करा!`}
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId
                  ? language === "en"
                    ? "Edit Payment"
                    : "पेमेंट संपादित करा"
                  : language === "en"
                  ? "Record Payment"
                  : "पेमेंट नोंदवा"}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScrollView}
              contentContainerStyle={styles.formContainer}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {renderFormField(
                language === "en" ? "Member Name *" : "सदस्याचे नाव *",
                <TouchableOpacity
                  style={[styles.pickerInput, errors.studentName && styles.inputError]}
                  onPress={() => setShowStudentPicker(true)}
                >
                  <Text
                    style={
                      formData.studentName
                        ? styles.pickerText
                        : styles.placeholderText
                    }
                  >
                    {formData.studentName ||
                      (language === "en"
                        ? "Select member"
                        : "सदस्य निवडा")}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#6B7280" />
                </TouchableOpacity>,
                "studentName"
              )}
              {showStudentPicker && (
                <View style={styles.pickerOptions}>
                  {members.map((s) => (
                    <TouchableOpacity
                      key={s._id}
                      style={styles.pickerOption}
                      onPress={() => selectStudent(s)}
                    >
                      <Text style={styles.pickerOptionText}>
                        {language === "mr" ? s.nameMr || s.name : s.name} ({
                          s.rollNumber ||
                          (language === "mr" ? s.roomOwnerNameMr || s.roomOwnerName : s.roomOwnerName) ||
                          s.roomNumber
                        })
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {members.length === 0 ? (
                    <Text style={styles.pickerEmpty}>No members found</Text>
                  ) : null}
                </View>
              )}

              {renderFormField(
                language === "en" ? "Month *" : "महिना *",
                <TouchableOpacity
                  style={[styles.pickerInput, errors.month && styles.inputError]}
                  onPress={() => setShowMonthPicker(true)}
                >
                  <Text style={styles.pickerText}>
                    {formData.month
                      ? (() => {
                          const d = new Date(formData.month);
                          return getMonthLabel(
                            d.getFullYear() * 12 + d.getMonth(),
                            language
                          );
                        })()
                      : language === "en"
                      ? "Select month"
                      : "महिना निवडा"}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#6B7280" />
                </TouchableOpacity>,
                "month"
              )}
              {showMonthPicker && (
                <View style={styles.pickerOptions}>
                  {filteredMonthOptionsForForm.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={styles.pickerOption}
                      onPress={() => selectMonth(opt)}
                    >
                      <Text style={styles.pickerOptionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {renderFormField(
                language === "en"
                  ? "Total Mess Fee (₹) *"
                  : "एकूण मेस फी (₹) *",
                <View
                  style={[
                    styles.remainingDisplay,
                    errors.totalMessFee && styles.inputError,
                  ]}
                >
                  <Text>
                    {formData.totalMessFee
                      ? formatCurrency(formData.totalMessFee)
                      : language === "en"
                      ? "Select member to auto-fill"
                      : "सदस्य निवडा (स्वतः भरेल)"}
                  </Text>
                </View>,
                "totalMessFee"
              )}

              {dueLoading ? (
                <View style={styles.formField}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.billLoadingText}>Loading due...</Text>
                </View>
              ) : dueError ? (
                <View style={styles.formField}>
                  <Text style={styles.billErrorText}>{dueError}</Text>
                </View>
              ) : previousDue != null ? (
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>
                    {language === "en"
                      ? "Pending Amount (before this payment)"
                      : "पेमेंटपूर्वीची बाकी / थकबाकी"}
                  </Text>
                  <Text style={styles.remainingDisplay}>
                    {formatCurrency(previousDue)}
                  </Text>
                </View>
              ) : null}

              {renderFormField(
                language === "en"
                  ? "Paid Amount (₹) *"
                  : "भरलेली रक्कम (₹) *",
                <TextInput
                  style={[styles.formInput, errors.paidAmount && styles.inputError]}
                  value={formData.paidAmount}
                  onChangeText={(v) => {
                    setFormData((p) => ({ ...p, paidAmount: v }));
                    setErrors((e) => ({ ...e, paidAmount: null }));
                  }}
                  placeholder={language === "en" ? "e.g. 2500" : "उदा. २५००"}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                />,
                "paidAmount"
              )}

              {!dueLoading && predictedDue != null ? (
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>
                    {language === "en"
                      ? "Pending Amount After This Payment"
                      : "या पेमेंटनंतर राहणारी बाकी"}
                  </Text>
                  <Text style={styles.remainingDisplay}>
                    {formatCurrency(predictedDue)}
                  </Text>
                </View>
              ) : null}

              {renderFormField(
                language === "en" ? "Payment Date *" : "पेमेंट तारीख *",
                <TouchableOpacity
                  style={[styles.pickerInput, errors.date && styles.inputError]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={styles.pickerText}>
                    {formatDisplayDate(formData.date)}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                </TouchableOpacity>,
                "date"
              )}
              {showDatePicker && (
                <DateTimePicker
                  value={formData.date}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                  maximumDate={new Date()}
                />
              )}

              {renderFormField(
                language === "en" ? "Payment Method" : "पेमेंट पद्धत",
                <TouchableOpacity
                  style={styles.pickerInput}
                  onPress={() => setShowPaymentMethodPicker(true)}
                >
                  <Text style={styles.pickerText}>{formData.paymentMethod}</Text>
                  <Ionicons name="chevron-down" size={20} color="#6B7280" />
                </TouchableOpacity>
              )}
              {showPaymentMethodPicker && (
                <View style={styles.pickerOptions}>
                  {PAYMENT_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={styles.pickerOption}
                      onPress={() => selectPaymentMethod(m)}
                    >
                      <Text style={styles.pickerOptionText}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingId
                      ? language === "en"
                        ? "Update Payment"
                        : "पेमेंट अपडेट करा"
                      : language === "en"
                      ? "Save Payment"
                      : "पेमेंट जतन करा"}
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
  headerRight: { width: 40 },
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
  summaryCardEmpty: {
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
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
  filterSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterInput: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  filterPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  },
  filterPickerText: {
    fontSize: 16,
    color: "#111827",
  },
  filterMonthOptions: {
    marginTop: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    maxHeight: 200,
  },
  filterMonthOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  listContent: {
    paddingBottom: 24,
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
  inlineEmptyText: {
    textAlign: "center",
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
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
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  cardLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 8,
  },
  cardValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  remainingRed: {
    color: "#DC2626",
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
    marginTop: 14,
    gap: 10,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#DC2626",
  },
  buttonText: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  modalClose: { padding: 4 },
  formScrollView: {
    maxHeight: Dimensions.get("window").height * 0.7,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  formField: {
    marginBottom: 16,
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
  pickerInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  pickerText: {
    fontSize: 16,
    color: "#111827",
  },
  placeholderText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  remainingDisplay: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  pickerOptions: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 8,
  },
  pickerOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pickerOptionText: {
    fontSize: 16,
    color: "#111827",
  },
  pickerEmpty: {
    fontSize: 14,
    color: "#6B7280",
    padding: 14,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
  },
  submitButton: {
    marginTop: 24,
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

