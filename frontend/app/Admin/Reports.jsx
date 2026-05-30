import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/AuthContext";
import api from "../../lib/api";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { getMonthLabel } from "../../lib/monthLabels";
import {
  clampYearMonthToSelectableWindow,
  combineMinYearMonth,
  getCurrentYearMonth,
  getMaxSelectableYearMonth,
  stepNextYearMonth,
  stepPrevYearMonth,
} from "../../lib/monthNavigation";

const formatDisplayDate = (d, language = "en") => {
  const date = d instanceof Date ? d : new Date(d);
  const locale = language === "mr" ? "mr-IN" : "en-IN";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const getReportPdfLabels = (language) => {
  const isMr = language === "mr";
  return {
    summary: isMr ? "सारांश" : "Summary",
    totalStudentPayments: isMr
      ? "विद्यार्थ्यांकडून मिळालेले एकूण पैसे"
      : "Total Student Payments",
    totalMessExpenses: isMr ? "एकूण मेस खर्च" : "Total Mess Expenses",
    totalSnacksRevenue: isMr ? "एकूण स्नॅक्स उत्पन्न" : "Total Snacks Revenue",
    finalBalance: isMr ? "अंतिम शिल्लक" : "Final Balance",
    paymentReport: isMr ? "पेमेंट रिपोर्ट" : "Payment Report",
    expensesReport: isMr ? "खर्च रिपोर्ट" : "Expenses Report",
    snacksReport: isMr ? "स्नॅक्स रिपोर्ट" : "Snacks Report",
    student: isMr ? "विद्यार्थी" : "Student",
    monthDate: isMr ? "महिना / तारीख" : "Month / Date",
    paid: isMr ? "भरलेले" : "Paid",
    remaining: isMr ? "शिल्लक" : "Remaining",
    status: isMr ? "स्थिती" : "Status",
    title: isMr ? "शीर्षक" : "Title",
    category: isMr ? "वर्ग" : "Category",
    date: isMr ? "तारीख" : "Date",
    amount: isMr ? "रक्कम" : "Amount",
    snack: isMr ? "स्नॅक" : "Snack",
    total: isMr ? "एकूण" : "Total",
    noPayments: isMr
      ? "या महिन्यासाठी कोणतेही पेमेंट रेकॉर्ड नाहीत."
      : "No payment records for this month.",
    noExpenses: isMr
      ? "या महिन्यासाठी कोणताही खर्च नाही."
      : "No expenses for this month.",
    noSnacks: isMr
      ? "या महिन्यासाठी कोणतीही स्नॅक्स विक्री नाही."
      : "No snack sales for this month.",
  };
};

const formatPaymentStatusForReport = (status, remaining, language) => {
  const raw = status || (Number(remaining) <= 0 ? "Paid" : "Pending");
  if (language !== "mr") return raw;
  const s = String(raw).toLowerCase();
  if (s === "paid") return "भरले";
  if (s === "pending") return "प्रलंबित";
  return raw;
};

const formatCurrency = (amount) => {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
};

const CATEGORY_LABELS_MR = {
  Vegetables: "भाज्या",
  Milk: "दुग्ध",
  Grocery: "किराणा",
  Gas: "गॅस",
  Maintenance: "देखभाल",
  Other: "इतर",
};

const generateReportHtml = ({
  language,
  selectedMonth,
  monthPayments,
  monthExpenses,
  monthSnacks,
  totalPayments,
  totalExpenses,
  totalSnacksRevenue,
  finalBalance,
}) => {
  const L = getReportPdfLabels(language);
  const monthLabel = getMonthLabel(selectedMonth, language);
  const pageTitle =
    language === "en" ? "Mess Reports" : "मेस रिपोर्ट्स";

  const summarySection = `
      <h1>${pageTitle} - ${monthLabel}</h1>
      <hr />
      <h2>${L.summary}</h2>
      <table>
        <tr>
          <th align="left">${L.totalStudentPayments}</th>
          <td align="right">${formatCurrency(totalPayments)}</td>
        </tr>
        <tr>
          <th align="left">${L.totalMessExpenses}</th>
          <td align="right">${formatCurrency(totalExpenses)}</td>
        </tr>
        <tr>
          <th align="left">${L.totalSnacksRevenue}</th>
          <td align="right">${formatCurrency(totalSnacksRevenue)}</td>
        </tr>
        <tr>
          <th align="left">${L.finalBalance}</th>
          <td align="right">${formatCurrency(finalBalance)}</td>
        </tr>
      </table>
    `;

  const paymentsRows = (monthPayments || [])
    .map((p) => {
      const paid = Number(p.paidAmountComputed ?? p.paidAmount ?? p.amount ?? 0);
      const remaining = Number(p.remainingAmount || 0);
      const status = formatPaymentStatusForReport(null, remaining, language);
      const studentName =
        language === "mr"
          ? p.studentNameMr || p.studentId?.nameMr || p.studentName || p.studentId?.name || "—"
          : p.studentName || p.studentId?.name || "—";
      const monthDisplay = p.month
        ? getMonthLabel(
            new Date(p.month).getFullYear() * 12 +
              new Date(p.month).getMonth(),
            language
          )
        : p.date
        ? formatDisplayDate(p.date, language)
        : "—";

      return `
        <tr>
          <td>${studentName}</td>
          <td>${monthDisplay}</td>
          <td align="right">${formatCurrency(paid)}</td>
          <td align="right">${formatCurrency(remaining)}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join("");

  const expensesRows = (monthExpenses || [])
    .map((e) => {
      return `
        <tr>
          <td>${language === "mr" ? e.titleMr || e.title || "—" : e.title || "—"}</td>
          <td>${
            language === "mr"
              ? CATEGORY_LABELS_MR[e.category] || e.category || "—"
              : e.category || "—"
          }</td>
          <td>${formatDisplayDate(e.date, language)}</td>
          <td align="right">${formatCurrency(e.amount || 0)}</td>
        </tr>
      `;
    })
    .join("");

  const snacksRows = (monthSnacks || [])
    .map((s) => {
      return `
        <tr>
          <td>${
            language === "mr" ? s.studentNameMr || s.studentName || "—" : s.studentName || "—"
          }</td>
          <td>${
            language === "mr"
              ? (s.snackItemMr || s.snackItem) + " × " + s.quantity
              : s.snackItem + " × " + s.quantity
          }</td>
          <td>${formatDisplayDate(s.date, language)}</td>
          <td align="right">${formatCurrency(s.totalPrice || 0)}</td>
        </tr>
      `;
    })
    .join("");

  const paymentsSection = `
      <h2 style="margin-top:24px;">${L.paymentReport}</h2>
      ${
        paymentsRows
          ? `<table>
              <tr>
                <th>${L.student}</th>
                <th>${L.monthDate}</th>
                <th align="right">${L.paid}</th>
                <th align="right">${L.remaining}</th>
                <th>${L.status}</th>
              </tr>
              ${paymentsRows}
            </table>`
          : `<p>${L.noPayments}</p>`
      }
    `;

  const expensesSection = `
      <h2 style="margin-top:24px;">${L.expensesReport}</h2>
      ${
        expensesRows
          ? `<table>
              <tr>
                <th>${L.title}</th>
                <th>${L.category}</th>
                <th>${L.date}</th>
                <th align="right">${L.amount}</th>
              </tr>
              ${expensesRows}
            </table>`
          : `<p>${L.noExpenses}</p>`
      }
    `;

  const snacksSection = `
      <h2 style="margin-top:24px;">${L.snacksReport}</h2>
      ${
        snacksRows
          ? `<table>
              <tr>
                <th>${L.student}</th>
                <th>${L.snack}</th>
                <th>${L.date}</th>
                <th align="right">${L.total}</th>
              </tr>
              ${snacksRows}
            </table>`
          : `<p>${L.noSnacks}</p>`
      }
    `;

  const htmlLang = language === "mr" ? "mr" : "en";

  return `
    <html lang="${htmlLang}">
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans Devanagari", sans-serif;
            padding: 24px;
            color: #111827;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 8px;
          }
          h2 {
            font-size: 18px;
            margin-top: 16px;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #E5E7EB;
            padding: 6px 8px;
            font-size: 12px;
          }
          th {
            background-color: #F9FAFB;
            text-align: left;
          }
        </style>
      </head>
      <body>
        ${summarySection}
        ${paymentsSection}
        ${expensesSection}
        ${snacksSection}
      </body>
    </html>
  `;
};

const filterByMonth = (items, selectedMonth, dateField = "date") => {
  return (items || []).filter((item) => {
    const d = new Date(item[dateField]);
    const ym = d.getFullYear() * 12 + d.getMonth();
    return ym === selectedMonth;
  });
};

const filterPaymentsByMonth = (payments, selectedMonth) => {
  return (payments || []).filter((p) => {
    const d = p.date ? new Date(p.date) : p.month ? new Date(p.month) : null;
    if (!d) return false;
    const ym = d.getFullYear() * 12 + d.getMonth();
    return ym === selectedMonth;
  });
};

export default function Reports() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    clampYearMonthToSelectableWindow(getCurrentYearMonth())
  );
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [snacks, setSnacks] = useState([]);
  const [dueByMemberId, setDueByMemberId] = useState(() => new Map());

  const fetchReports = async () => {
    try {
      setLoading(true);
      const [payRes, expRes, snackRes] = await Promise.allSettled([
        api.get("/api/payments"),
        api.get("/api/expenses"),
        api.get("/api/snacks"),
      ]);
      const rawPayments = Array.isArray(payRes.value?.data) ? payRes.value.data : [];
      const normalizedPayments = rawPayments.map((p) => ({
        ...p,
        studentId: p?.memberId?._id || p?.memberId || p?.studentId,
        studentName: p?.memberName || p?.memberId?.name || p?.studentName || "",
        studentNameMr:
          p?.memberNameMr ||
          p?.memberId?.nameMr ||
          p?.studentNameMr ||
          "",
      }));
      setPayments(normalizedPayments);
      setExpenses(Array.isArray(expRes.value?.data) ? expRes.value.data : []);
      const rawSnacks = Array.isArray(snackRes.value?.data) ? snackRes.value.data : [];
      const normalizedSnacks = rawSnacks.map((s) => ({
        ...s,
        studentName: s?.studentName || s?.memberName || s?.customerName || s?.studentId?.name || "—",
        studentNameMr:
          s?.studentNameMr ||
          s?.memberNameMr ||
          s?.customerNameMr ||
          s?.studentId?.nameMr ||
          "—",
      }));
      setSnacks(normalizedSnacks);
    } catch (err) {
      Alert.alert("Error", err.response?.data?.message || "Failed to fetch reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) fetchReports();
  }, [authLoading, isAuthenticated]);

  // Earliest month with any data (used to block navigation before data/start month)
  const allMonths = [
    ...payments.map((p) => {
      const d = p.date ? new Date(p.date) : p.month ? new Date(p.month) : null;
      if (!d) return null;
      return d.getFullYear() * 12 + d.getMonth();
    }),
    ...expenses.map((e) => {
      const d = new Date(e.date);
      return d.getFullYear() * 12 + d.getMonth();
    }),
    ...snacks.map((s) => {
      const d = new Date(s.date);
      return d.getFullYear() * 12 + d.getMonth();
    }),
  ].filter((ym) => ym != null && !Number.isNaN(ym));
  const minReportMonth = combineMinYearMonth(
    allMonths.length > 0 ? Math.min(...allMonths) : getCurrentYearMonth(0)
  );

  useEffect(() => {
    setSelectedMonth((m) =>
      clampYearMonthToSelectableWindow(m, minReportMonth, getMaxSelectableYearMonth())
    );
  }, [minReportMonth, payments.length, expenses.length, snacks.length]);

  const monthPayments = filterPaymentsByMonth(payments, selectedMonth);
  const monthExpenses = filterByMonth(expenses, selectedMonth);
  const monthSnacks = filterByMonth(snacks, selectedMonth);

  const selectedMonthParam = React.useMemo(() => {
    const year = Math.floor(selectedMonth / 12);
    const monthIndex = selectedMonth % 12;
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isAuthenticated) return;
      try {
        const res = await api.get("/api/members/due-month", {
          params: { month: selectedMonthParam },
        });
        if (cancelled) return;
        const members = Array.isArray(res?.data?.members) ? res.data.members : [];
        const next = new Map(
          members
            .map((m) => {
              const id = m?.memberId ? String(m.memberId) : "";
              if (!id) return null;
              const due = Number(m?.dueAmount ?? m?.remainingAmount ?? 0);
              return [id, due];
            })
            .filter(Boolean)
        );
        setDueByMemberId(next);
      } catch (_) {
        if (!cancelled) setDueByMemberId(new Map());
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedMonthParam]);

  // Reports: show one payment row per member for the month (not one per transaction),
  // so "Paid" and "Remaining" match the month snapshot consistently.
  const monthPaymentReportRows = React.useMemo(() => {
    const byMember = new Map();

    for (const p of monthPayments) {
      const memberId = p?.studentId ? String(p.studentId) : "";
      if (!memberId) continue;

      const prev = byMember.get(memberId);
      const paidTxn = Number(p?.paidAmount || p?.amount || 0);
      const paidComputed = Number(
        p?.paidAmountComputed ?? p?.paidAmount ?? p?.amount ?? 0
      );
      const remaining = Number(p?.remainingAmount || 0);

      if (!prev) {
        byMember.set(memberId, {
          ...p,
          reportMemberId: memberId,
          // total of transactions for the month (what was actually collected via Payment records)
          paidAmount: paidTxn,
          // month computed (should equal paidAmount sum, but keep in case)
          paidAmountComputed: paidComputed,
          remainingAmount: remaining,
        });
        continue;
      }

      // Accumulate the month paid total from transactions
      const nextPaidTxn = Number(prev.paidAmount || 0) + paidTxn;
      // Keep the latest computed snapshot (usually same regardless of row order)
      const nextPaidComputed = Math.max(
        Number(prev.paidAmountComputed || 0),
        paidComputed
      );
      // Remaining should represent the month snapshot; choose the minimum remaining seen.
      const nextRemaining = Math.min(
        Number(prev.remainingAmount || 0),
        remaining
      );

      byMember.set(memberId, {
        ...prev,
        reportMemberId: memberId,
        paidAmount: nextPaidTxn,
        paidAmountComputed: nextPaidComputed,
        remainingAmount: nextRemaining,
      });
    }

    // Sort by member name
    const rows = Array.from(byMember.values());
    rows.sort((a, b) => {
      const an =
        (language === "mr"
          ? a.studentNameMr || a.studentName || ""
          : a.studentName || ""
        ).toLowerCase();
      const bn =
        (language === "mr"
          ? b.studentNameMr || b.studentName || ""
          : b.studentName || ""
        ).toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
    return rows.map((row) => {
      const memberId =
        row?.reportMemberId != null
          ? String(row.reportMemberId)
          : row?.studentId
            ? String(row.studentId)
            : "";
      const due =
        memberId && dueByMemberId.has(memberId)
          ? Number(dueByMemberId.get(memberId) || 0)
          : null;
      return {
        ...row,
        // For reports/export, "Remaining" should reflect month dueAmount.
        remainingAmount: due != null ? due : Number(row?.remainingAmount || 0),
      };
    });
  }, [monthPayments, language, dueByMemberId]);

  const totalPayments = monthPayments.reduce(
    (sum, p) => sum + Number(p.paidAmount || p.amount || 0),
    0
  );
  const totalExpenses = monthExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  const totalSnacksRevenue = monthSnacks.reduce(
    (sum, s) => sum + Number(s.totalPrice || 0),
    0
  );
  const finalBalance = totalPayments + totalSnacksRevenue - totalExpenses;

  const maxChartValue = Math.max(
    totalPayments,
    totalExpenses,
    totalSnacksRevenue,
    1
  );
  const chartPaymentsWidth = (totalPayments / maxChartValue) * 100;
  const chartExpensesWidth = (totalExpenses / maxChartValue) * 100;
  const chartSnacksWidth = (totalSnacksRevenue / maxChartValue) * 100;

  const handleExport = async () => {
    try {
      if (!monthPayments.length && !monthExpenses.length && !monthSnacks.length) {
        Alert.alert(
          language === "en" ? "No data" : "माहिती नाही",
          language === "en"
            ? "There is no data for the selected month to export."
            : "निवडलेल्या महिन्यासाठी एक्सपोर्ट करण्यासाठी कोणतीही माहिती नाही."
        );
        return;
      }

      const html = generateReportHtml({
        language,
        selectedMonth,
        monthPayments: monthPaymentReportRows,
        monthExpenses,
        monthSnacks,
        totalPayments,
        totalExpenses,
        totalSnacksRevenue,
        finalBalance,
      });

      const y = Math.floor(selectedMonth / 12);
      const m = String((selectedMonth % 12) + 1).padStart(2, "0");
      const fileName = `mess-report-${y}-${m}.pdf`;

      const { uri } = await Print.printToFileAsync({ html });

      // Copy to a predictable name (with month) before sharing
      const targetUri = FileSystem.cacheDirectory
        ? `${FileSystem.cacheDirectory}${fileName}`
        : uri;

      if (targetUri !== uri) {
        try {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        } catch {}
        await FileSystem.copyAsync({ from: uri, to: targetUri });
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetUri, {
          mimeType: "application/pdf",
          dialogTitle:
            language === "en"
              ? "Share Mess Report PDF"
              : "मेस रिपोर्ट PDF शेअर करा",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          language === "en" ? "Report exported" : "रिपोर्ट एक्सपोर्ट झाला",
          Platform.OS === "android"
            ? `PDF generated at: ${targetUri}`
            : "PDF has been generated. Please open it from your Files app."
        );
      }
    } catch (error) {
      console.error("PDF export error", error);
      Alert.alert(
        language === "en" ? "Export failed" : "एक्सपोर्ट अयशस्वी",
        language === "en"
          ? "Could not export the report to PDF. Please try again."
          : "रिपोर्ट PDF मध्ये एक्सपोर्ट करता आला नाही. कृपया पुन्हा प्रयत्न करा."
      );
    }
  };

  const renderPaymentItem = ({ item }) => {
    const paid = Number(item.paidAmountComputed ?? item.paidAmount ?? item.amount ?? 0);
    const remaining = Number(item.remainingAmount || 0);
    const status = remaining <= 0 ? "Paid" : "Pending";
    const studentName =
      language === "mr"
        ? item.studentNameMr || item.studentId?.nameMr || item.studentName || item.studentId?.name || "—"
        : item.studentName || item.studentId?.name || "—";
    const monthDisplay = item.month
      ? getMonthLabel(
          new Date(item.month).getFullYear() * 12 +
            new Date(item.month).getMonth(),
          language
        )
      : item.date
      ? formatDisplayDate(item.date, language)
      : "—";
    return (
      <View style={styles.listCard}>
        <View style={styles.listCardRow}>
          <Text style={styles.listCardTitle}>{studentName}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>
        <View style={styles.listCardMeta}>
          <Text style={styles.listCardLabel}>Month:</Text>
          <Text style={styles.listCardValue}>{monthDisplay}</Text>
        </View>
        <View style={styles.listCardMeta}>
          <Text style={styles.listCardLabel}>Paid:</Text>
          <Text style={styles.listCardValue}>
            {formatCurrency(paid)}
          </Text>
        </View>
        <View style={styles.listCardMeta}>
          <Text style={styles.listCardLabel}>Remaining:</Text>
          <Text style={styles.listCardValue}>
            {formatCurrency(remaining)}
          </Text>
        </View>
      </View>
    );
  };

  const renderExpenseItem = ({ item }) => (
    <View style={styles.listCard}>
      <View style={styles.listCardRow}>
        <Text style={styles.listCardTitle}>
          {language === "mr" ? item.titleMr || item.title || "—" : item.title || "—"}
        </Text>
        <Text style={styles.listCardAmount}>
          {formatCurrency(item.amount)}
        </Text>
      </View>
      <View style={styles.listCardMeta}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {language === "mr"
              ? CATEGORY_LABELS_MR[item.category] || item.category || "—"
              : item.category || "—"}
          </Text>
        </View>
        <Text style={styles.listCardDate}>{formatDisplayDate(item.date, language)}</Text>
      </View>
    </View>
  );

  const renderSnackItem = ({ item }) => (
    <View style={styles.listCard}>
      <View style={styles.listCardRow}>
        <Text style={styles.listCardTitle}>
          {language === "mr"
            ? item.studentNameMr || item.studentName || "—"
            : item.studentName || "—"}
        </Text>
        <Text style={styles.listCardAmount}>
          {formatCurrency(item.totalPrice)}
        </Text>
      </View>
      <View style={styles.listCardMeta}>
        <Text style={styles.listCardLabel}>Snack:</Text>
        <Text style={styles.listCardValue}>
          {language === "mr" ? item.snackItemMr || item.snackItem : item.snackItem} ×{" "}
          {item.quantity}
        </Text>
      </View>
      <Text style={styles.listCardDate}>{formatDisplayDate(item.date, language)}</Text>
    </View>
  );

  const EmptyList = ({ message }) => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
      <Text style={styles.emptyText}>{message}</Text>
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>
          {language === "en" ? "Mess Reports" : "मेस रिपोर्ट्स"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Month Selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() => setSelectedMonth((m) => stepPrevYearMonth(m, minReportMonth))}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {getMonthLabel(selectedMonth, language)}
          </Text>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() => setSelectedMonth((m) => stepNextYearMonth(m))}
          >
            <Ionicons name="chevron-forward" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Ionicons name="card" size={24} color="#059669" />
                <Text style={styles.summaryLabel}>
                  {language === "en"
                    ? "Total Student Payments"
                    : "विद्यार्थ्यांकडून मिळालेले एकूण पैसे"}
                </Text>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(totalPayments)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="wallet" size={24} color="#DC2626" />
                <Text style={styles.summaryLabel}>
                  {language === "en"
                    ? "Total Mess Expenses"
                    : "एकूण मेस खर्च"}
                </Text>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(totalExpenses)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="fast-food" size={24} color="#2563EB" />
                <Text style={styles.summaryLabel}>
                  {language === "en"
                    ? "Total Snacks Revenue"
                    : "एकूण स्नॅक्स उत्पन्न"}
                </Text>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(totalSnacksRevenue)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="trending-up" size={24} color="#7C3AED" />
                <Text style={styles.summaryLabel}>
                  {language === "en" ? "Final Balance" : "अंतिम शिल्लक"}
                </Text>
                <Text style={styles.summaryAmount}>
                  {formatCurrency(finalBalance)}
                </Text>
              </View>
            </View>

            {/* Bar Chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>
                {language === "en"
                  ? "Summary Comparison"
                  : "सारांश तुलना"}
              </Text>
              <View style={styles.chartBar}>
                <Text style={styles.chartLabel}>
                  {language === "en" ? "Payments" : "पेमेंट्स"}
                </Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      styles.chartGreen,
                      { width: `${chartPaymentsWidth}%` },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.chartBar}>
                <Text style={styles.chartLabel}>
                  {language === "en" ? "Expenses" : "खर्च"}
                </Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      styles.chartRed,
                      { width: `${chartExpensesWidth}%` },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.chartBar}>
                <Text style={styles.chartLabel}>
                  {language === "en" ? "Snacks" : "स्नॅक्स"}
                </Text>
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      styles.chartBlue,
                      { width: `${chartSnacksWidth}%` },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Export Button */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={handleExport}
              activeOpacity={0.8}
            >
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>
                {language === "en"
                  ? "Export Report (PDF)"
                  : "रिपोर्ट एक्सपोर्ट करा (PDF)"}
              </Text>
            </TouchableOpacity>

            {/* Payment Report */}
            <Text style={styles.sectionTitle}>
              {language === "en" ? "Payment Report" : "पेमेंट रिपोर्ट"}
            </Text>
            <FlatList
              data={monthPaymentReportRows}
              keyExtractor={(item) => item._id || `${item.studentName}-${item.month}`}
              renderItem={renderPaymentItem}
              scrollEnabled={false}
              ListEmptyComponent={
                <EmptyList
                  message={
                    language === "en"
                      ? "No payment records for this month"
                      : "या महिन्यासाठी कोणतेही पेमेंट रेकॉर्ड नाहीत"
                  }
                />
              }
            />

            {/* Expenses Report */}
            <Text style={styles.sectionTitle}>
              {language === "en" ? "Expenses Report" : "खर्च रिपोर्ट"}
            </Text>
            <FlatList
              data={monthExpenses}
              keyExtractor={(item) => item._id}
              renderItem={renderExpenseItem}
              scrollEnabled={false}
              ListEmptyComponent={
                <EmptyList
                  message={
                    language === "en"
                      ? "No expenses for this month"
                      : "या महिन्यासाठी कोणताही खर्च नाही"
                  }
                />
              }
            />

            {/* Snacks Report */}
            <Text style={styles.sectionTitle}>
              {language === "en" ? "Snacks Report" : "स्नॅक्स रिपोर्ट"}
            </Text>
            <FlatList
              data={monthSnacks}
              keyExtractor={(item) => item._id}
              renderItem={renderSnackItem}
              scrollEnabled={false}
              ListEmptyComponent={
                <EmptyList
                  message={
                    language === "en"
                      ? "No snack sales for this month"
                      : "या महिन्यासाठी कोणतीही स्नॅक्स विक्री नाही"
                  }
                />
              }
            />
          </>
        )}
      </ScrollView>
     
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  monthNavButton: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginHorizontal: 16,
    minWidth: 140,
    textAlign: "center",
  },
  loadingRow: {
    paddingVertical: 40,
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  summaryCard: {
    width: "48%",
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
  summaryLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: "700",
  },
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  chartBar: {
    marginBottom: 12,
  },
  chartLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 4,
  },
  chartTrack: {
    height: 20,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    overflow: "hidden",
  },
  chartFill: {
    height: "100%",
    borderRadius: 8,
  },
  chartGreen: { backgroundColor: "#059669" },
  chartRed: { backgroundColor: "#DC2626" },
  chartBlue: { backgroundColor: "#2563EB" },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    marginBottom: 24,
  },
  exportButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  listCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  listCardAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  listCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  listCardLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginRight: 6,
  },
  listCardValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  listCardDate: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  categoryBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
});