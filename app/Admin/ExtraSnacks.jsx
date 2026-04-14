import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { getMonthLabel } from "../../lib/monthLabels";

const formatDisplayDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatCardDate = (d, lang) => {
  const date = d instanceof Date ? d : new Date(d);
  if (lang === "mr") {
    return date.toLocaleDateString("mr-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return formatDisplayDate(d);
};

const formatCurrency = (amount) => {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
};

const resolveDisplayTotal = (order) => {
  const charged = Number(order?.chargedAmount);
  if (Number.isFinite(charged) && charged >= 0) return charged;
  const qty = Number(order?.quantity || 0);
  const price = Number(order?.pricePerItem || 0);
  return qty * price;
};

const getSelectedMonth = (monthOffset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  return d.getFullYear() * 12 + d.getMonth();
};

const INITIAL_FORM = {
  customerName: "",
  customerType: "outside",
  studentId: "",
  snackProductId: "",
  snackItem: "",
  quantity: "",
  pricePerItem: "",
  date: new Date(),
};

export default function ExtraSnacks() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const [snacks, setSnacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackProducts, setSnackProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(getSelectedMonth());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [showSnackPicker, setShowSnackPicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const fetchSnacks = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/snacks");
      const raw = Array.isArray(res.data) ? res.data : [];
      // Backward-compat: normalize display name to the old `studentName` field.
      const normalized = raw.map((s) => ({
        ...s,
        studentName:
          s?.studentName || s?.memberName || s?.customerName || s?.studentId?.name || "",
        studentNameMr:
          s?.studentNameMr ||
          s?.memberNameMr ||
          s?.customerNameMr ||
          s?.studentId?.nameMr ||
          "",
      }));
      setSnacks(normalized);
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err.response?.data?.message || t("extra_snacks_alert_fetch_orders_failed")
      );
      setSnacks([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSnackProducts = async () => {
    try {
      const res = await api.get("/api/snack-products", {
        params: { available: "true" },
      });
      setSnackProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err.response?.data?.message || t("extra_snacks_alert_fetch_products_failed")
      );
      setSnackProducts([]);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await api.get("/api/members");
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err?.response?.data?.message || t("extra_snacks_alert_fetch_members_failed")
      );
      setMembers([]);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      fetchSnacks();
      fetchSnackProducts();
      fetchMembers();
    }
  }, [authLoading, isAuthenticated]);

  const filteredMembers = members.filter((m) => {
    if (!memberSearch.trim()) return true;
    const search = memberSearch.trim().toLowerCase();
    const name =
      (language === "mr" ? m.nameMr || m.name : m.name) || "";
    const nameLower = String(name).toLowerCase();
    const roll = (m.rollNumber || "").toLowerCase();
    const room = (m.roomNumber || m.roomOwnerName || "").toLowerCase();
    const owner =
      (language === "mr" ? m.roomOwnerNameMr || m.roomOwnerName : m.roomOwnerName) || "";
    const ownerLower = String(owner).toLowerCase();
    return (
      nameLower.includes(search) ||
      roll.includes(search) ||
      room.includes(search) ||
      ownerLower.includes(search)
    );
  });

  const selectedSnackProduct =
    snackProducts.find((p) => p._id === form.snackProductId) || null;
  const snackProductsForDropdown = snackProducts.filter(
    (p) => Number(p?.quantity ?? 0) > 0
  );
  const snackItemDisplay =
    language === "mr"
      ? selectedSnackProduct?.nameMr || form.snackItem
      : form.snackItem || selectedSnackProduct?.name || "";

  const allSnacks = snacks;

  const snackMonths = allSnacks
    .map((s) => {
      const d = new Date(s.date);
      return d.getFullYear() * 12 + d.getMonth();
    })
    .filter((ym) => !Number.isNaN(ym));
  const minSnackMonth =
    snackMonths.length > 0 ? Math.min(...snackMonths) : getSelectedMonth(0);

  const monthSnacks = allSnacks.filter((s) => {
    const d = new Date(s.date);
    const ym = d.getFullYear() * 12 + d.getMonth();
    return ym === selectedMonth;
  });

  const displaySnacks = useMemo(() => {
    const memberDisplay = (o) =>
      language === "mr" ? o?.studentNameMr || o?.studentName : o?.studentName;

    const snackDisplay = (o) =>
      language === "mr" ? o?.snackItemMr || o?.snackItem : o?.snackItem;

    const normal = [];
    const splitGroupsById = new Map();

    for (const o of monthSnacks || []) {
      const billSplitRequestId = o?.billSplitRequestId;
      const isSplit = !!billSplitRequestId;

      if (!isSplit) {
        normal.push(o);
        continue;
      }

      const splitId = String(billSplitRequestId);
      const existing = splitGroupsById.get(splitId);

      const displayMemberName = memberDisplay(o) || "Member";
      const displaySnackName = snackDisplay(o) || "Snack";
      const orderId = String(o?._id || "");

      if (!existing) {
        splitGroupsById.set(splitId, {
          _id: `split-${splitId}`,
          isSplitGroup: true,
          billSplitRequestId: splitId,
          orderIds: orderId ? [orderId] : [],
          items: [o],
          memberNames: [displayMemberName],
          snackNames: [displaySnackName],
          quantityTotal: Number(o?.quantity || 0),
          totalPrice: resolveDisplayTotal(o),
          // Choose latest date among rows for stable display.
          date: o?.date ? new Date(o.date) : null,
        });
      } else {
        existing.items.push(o);
        if (orderId) existing.orderIds.push(orderId);
        existing.quantityTotal += Number(o?.quantity || 0);
        existing.totalPrice += resolveDisplayTotal(o);
        existing.memberNames.push(displayMemberName);
        existing.snackNames.push(displaySnackName);
        if (o?.date) {
          const d = new Date(o.date);
          if (!Number.isNaN(d.getTime()) && (!existing.date || d > existing.date)) {
            existing.date = d;
          }
        }
      }
    }

    const splitGroups = Array.from(splitGroupsById.values()).map((g) => {
      const uniqMembers = Array.from(new Set(g.memberNames.filter(Boolean)));
      const uniqSnackNames = Array.from(new Set(g.snackNames.filter(Boolean)));

      // Keep member/snack lists compact for the card header.
      const memberPreview = uniqMembers.slice(0, 3).join(", ");
      const memberOverflow = Math.max(0, uniqMembers.length - 3);

      const snackPreview = uniqSnackNames.slice(0, 2).join(" + ");
      const snackOverflow = Math.max(0, uniqSnackNames.length - 2);

      return {
        ...g,
        memberNames: uniqMembers,
        snackNames: uniqSnackNames,
        memberPreview,
        memberOverflow,
        snackPreview,
        snackOverflow,
        date: g.date || new Date(),
      };
    });

    // Sort by date desc for both normal and split cards.
    const normalizedNormal = (normal || []).map((o) => ({
      ...o,
      _sortDate: o?.date ? new Date(o.date) : new Date(0),
    }));
    const normalizedSplit = splitGroups.map((g) => ({
      ...g,
      _sortDate: g.date ? new Date(g.date) : new Date(0),
    }));

    const merged = [...normalizedNormal, ...normalizedSplit].sort((a, b) => {
      const ad = a?._sortDate?.getTime?.() || 0;
      const bd = b?._sortDate?.getTime?.() || 0;
      return bd - ad;
    });

    // Remove helper field so render doesn't accidentally depend on it.
    return merged.map(({ _sortDate, ...rest }) => rest);
  }, [monthSnacks, language]);

  const totalMonthRevenue = monthSnacks.reduce(
    (sum, s) => sum + resolveDisplayTotal(s),
    0
  );

  const totalPrice = (() => {
    const q = Number(form.quantity);
    const p = Number(form.pricePerItem);
    if (!Number.isFinite(q) || !Number.isFinite(p) || q < 0 || p < 0) return 0;
    return q * p;
  })();

  const openAddForm = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setErrors({});
    setShowSnackPicker(false);
    setShowMemberPicker(false);
    setMemberSearch("");
    setFormVisible(true);
  };

  const openEditForm = (snack) => {
    const matchedProduct = snackProducts.find(
      (p) => p.name === snack.snackItem
    );
    setEditingId(snack._id);
    setForm({
      customerName: snack.isOutsideCustomer
        ? language === "mr"
          ? (snack.studentNameMr || snack.studentName || "").trim()
          : (snack.studentName || snack.studentNameMr || "").trim()
        : snack.studentName || snack.studentNameMr || "",
      customerType: snack.isOutsideCustomer ? "outside" : "member",
      studentId: snack.studentId || "",
      snackProductId: matchedProduct?._id || "",
      snackItem: snack.snackItem || "",
      quantity: String(snack.quantity || ""),
      pricePerItem: String(
        matchedProduct?.price ?? snack.pricePerItem ?? ""
      ),
      date: snack.date ? new Date(snack.date) : new Date(),
    });
    setErrors({});
    setShowSnackPicker(false);
    setShowMemberPicker(false);
    setMemberSearch("");
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingId(null);
    setShowDatePicker(false);
    setShowSnackPicker(false);
    setShowMemberPicker(false);
  };

  const validate = () => {
    const e = {};
    if (form.customerType === "outside") {
      if (!form.customerName?.trim()) {
        e.customerName =
          language === "en"
            ? "Customer name is required"
            : "ग्राहकाचे नाव आवश्यक आहे";
      }
    } else if (!form.studentId) {
      e.studentId = "Member is required";
    }
    if (!form.snackProductId) e.snackItem = "Snack item is required";
    if (!form.quantity?.trim()) e.quantity = "Quantity is required";
    else {
      const q = Number(form.quantity);
      if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) {
        e.quantity = "Enter a valid quantity (integer min 1)";
      } else if (selectedSnackProduct) {
        const stockQty = Number(selectedSnackProduct?.quantity);
        const isStockFinite = Number.isFinite(stockQty);
        if (selectedSnackProduct?.availability === false) {
          e.quantity = "This snack is not available";
        } else if (isStockFinite && q > stockQty) {
          e.quantity = `Only ${stockQty} available. Please reduce quantity.`;
        }
      }
    }
    if (!form.date) e.date = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const isOutsideCustomer = form.customerType !== "member";
      const payload = {
        isOutsideCustomer,
        studentId: isOutsideCustomer ? undefined : form.studentId,
        customerName: isOutsideCustomer ? form.customerName.trim() : undefined,
        snackProductId: form.snackProductId || undefined,
        snackItem: form.snackItem.trim(),
        quantity: Number(form.quantity),
        pricePerItem: Number(form.pricePerItem),
        totalPrice: totalPrice,
        date: form.date.toISOString(),
      };
      if (editingId) {
        await api.put(`/api/snacks/${editingId}`, payload);
        Alert.alert(t("alert_success"), t("extra_snacks_alert_order_updated"));
      } else {
        await api.post("/api/snacks", payload);
        Alert.alert(t("alert_success"), t("extra_snacks_alert_order_added"));
      }
      closeForm();
      fetchSnacks();
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err.response?.data?.message || t("extra_snacks_alert_save_failed")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (snack) => {
    const isSplitGroup = !!snack?.isSplitGroup;

    const displayName = isSplitGroup
      ? snack?.memberPreview || "Split"
      : language === "mr"
        ? snack.studentNameMr || snack.studentName
        : snack.studentName;

    Alert.alert(
      t("extra_snacks_alert_delete_title"),
      isSplitGroup
        ? language === "mr"
          ? `विभाजित ऑर्डर हटवायचा आहे का? यामुळे त्या split request मधील सर्व रेकॉर्ड हटतील. (${displayName})`
          : `Delete this split snack order? This will remove all member rows for the split request. (${displayName})`
        : t("extra_snacks_alert_delete_body").replace("{{name}}", displayName),
      [
        { text: t("button_cancel"), style: "cancel" },
        {
          text: t("manage_members_delete"),
          style: "destructive",
          onPress: async () => {
            try {
              if (isSplitGroup) {
                const orderIds = Array.isArray(snack?.orderIds) ? snack.orderIds : [];
                // Delete all member rows belonging to the same bill split request.
                for (const id of orderIds) {
                  await api.delete(`/api/snacks/${id}`);
                }
              } else {
                await api.delete(`/api/snacks/${snack._id}`);
              }
              Alert.alert(
                t("alert_success"),
                t("extra_snacks_alert_order_deleted")
              );
              fetchSnacks();
            } catch (err) {
              Alert.alert(
                t("alert_error"),
                err.response?.data?.message ||
                  t("extra_snacks_alert_delete_failed")
              );
            }
          },
        },
      ]
    );
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) setForm((f) => ({ ...f, date: selectedDate }));
  };

  const renderSnackCard = ({ item }) => {
    const isSplitGroup = !!item?.isSplitGroup;

    if (isSplitGroup) {
      const title =
        language === "mr"
          ? `विभाजित स्नॅक्स (${item.memberNames?.length || 0} सदस्य)`
          : `Split Snacks (${item.memberNames?.length || 0} members)`;

      const snackLine =
        item.snackOverflow > 0 || item.snackNames?.length > 1
          ? language === "mr"
            ? `एकाधिक स्नॅक्स (${item.snackNames?.length || 0})`
            : `Multiple snacks (${item.snackNames?.length || 0})`
          : language === "mr"
            ? item.snackNames?.[0] || "Snack"
            : item.snackNames?.[0] || "Snack";

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardTotal}>{formatCurrency(item.totalPrice || 0)}</Text>
          </View>

          <View style={styles.cardRow}>
            <Ionicons name="people-outline" size={16} color="#6B7280" />
            <Text style={styles.cardLabel}>{language === "mr" ? "सदस्य:" : "Members:"}</Text>
            <Text style={styles.cardValue}>
              {item.memberPreview}
              {item.memberOverflow > 0
                ? language === "mr"
                  ? ` +${item.memberOverflow} अधिक`
                  : ` +${item.memberOverflow} more`
                : ""}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Ionicons name="fast-food-outline" size={16} color="#6B7280" />
            <Text style={styles.cardLabel}>{t("qr_scanner_label_snack")}:</Text>
            <Text style={styles.cardValue}>{snackLine}</Text>
          </View>

          <View style={styles.cardRow}>
            <Ionicons name="list-outline" size={16} color="#6B7280" />
            <Text style={styles.cardLabel}>{t("qr_scanner_label_quantity")}:</Text>
            <Text style={styles.cardValue}>{item.quantityTotal}</Text>
            <Text style={styles.cardLabel}>
              {language === "mr"
                ? " (विभाजित)"
                : " (split)"}
            </Text>
          </View>

          <View style={styles.cardRow}>
            <Ionicons name="calendar-outline" size={16} color="#6B7280" />
            <Text style={styles.cardDate}>{formatCardDate(item.date, language)}</Text>
          </View>

          <View style={styles.cardActions}>
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
    }

    // Normal (non-split) snack order
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {language === "mr" ? item.studentNameMr || item.studentName : item.studentName}
          </Text>
          <Text style={styles.cardTotal}>
            {formatCurrency(resolveDisplayTotal(item))}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name="fast-food-outline" size={16} color="#6B7280" />
          <Text style={styles.cardLabel}>{t("qr_scanner_label_snack")}:</Text>
          <Text style={styles.cardValue}>
            {language === "mr" ? item.snackItemMr || item.snackItem : item.snackItem}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name="list-outline" size={16} color="#6B7280" />
          <Text style={styles.cardLabel}>{t("qr_scanner_label_quantity")}:</Text>
          <Text style={styles.cardValue}>{item.quantity}</Text>
          <Text style={styles.cardLabel}>
            {" "}
            × ₹{item.pricePerItem}
            {item?.billSplitRequestId
              ? language === "mr"
                ? " (विभाजित रक्कम लागू)"
                : " (split charged)"
              : ""}
          </Text>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <Text style={styles.cardDate}>
            {formatCardDate(item.date, language)}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditForm(item)}
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
          {language === "en" ? "Extra Snacks" : "अतिरिक्त स्नॅक्स"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.topSection}>
        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>
            {language === "en"
              ? "Total Snacks Revenue"
              : "एकूण स्नॅक्स उत्पन्न"}{" "}
            ({getMonthLabel(selectedMonth, language)})
          </Text>
          <Text style={styles.revenueAmount}>{formatCurrency(totalMonthRevenue)}</Text>
        </View>
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() =>
              setSelectedMonth((m) => {
                const next = m - 1;
                return next < minSnackMonth ? minSnackMonth : next;
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddForm}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {language === "en" ? "Add Snack Order" : "स्नॅक्स ऑर्डर जोडा"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={displaySnacks}
          keyExtractor={(item) => String(item._id)}
          renderItem={renderSnackCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="fast-food-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {language === "en"
                  ? `No snack orders for ${getMonthLabel(selectedMonth, language)}. Add one!`
                  : `${getMonthLabel(selectedMonth, language)} साठी कोणत्याही स्नॅक्स ऑर्डर नाहीत. नवीन ऑर्डर जोडा!`}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
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
                    ? "Edit Snack Order"
                    : "स्नॅक्स ऑर्डर संपादित करा"
                  : language === "en"
                  ? "Add Snack Order"
                  : "स्नॅक्स ऑर्डर जोडा"}
              </Text>
              <TouchableOpacity onPress={closeForm} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.customerTypeToggle}>
                <TouchableOpacity
                  style={styles.customerTypeOption}
                  onPress={() => {
                    setForm((f) => ({
                      ...f,
                      customerType: "outside",
                      studentId: "",
                      customerName: "",
                    }));
                    setShowMemberPicker(false);
                  }}
                >
                  <Ionicons
                    name={
                      form.customerType === "outside"
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={20}
                    color="#111827"
                  />
                  <Text style={styles.customerTypeLabel}>
                    {language === "en" ? "Outside customer" : "बाहेरील ग्राहक"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.customerTypeOption}
                  onPress={() => {
                    setForm((f) => ({
                      ...f,
                      customerType: "member",
                    }));
                  }}
                >
                  <Ionicons
                    name={
                      form.customerType === "member"
                        ? "radio-button-on"
                        : "radio-button-off"
                    }
                    size={20}
                    color="#111827"
                  />
                  <Text style={styles.customerTypeLabel}>
                    {language === "en" ? "Existing member" : "विद्यमान सदस्य"}
                  </Text>
                </TouchableOpacity>
              </View>

              {form.customerType === "outside" ? (
                <>
                  <Text style={styles.formLabel}>
                    {language === "en"
                      ? "Customer name (English or Marathi) *"
                      : "ग्राहकाचे नाव (मराठी किंवा इंग्रजी) *"}
                  </Text>
                  <TextInput
                    style={[styles.input, errors.customerName && styles.inputError]}
                    value={form.customerName}
                    onChangeText={(v) => {
                      setForm((f) => ({ ...f, customerName: v }));
                      setErrors((e) => ({ ...e, customerName: null }));
                    }}
                    placeholder={
                      language === "en"
                        ? "e.g. Walk-in customer or राजेश पाटील"
                        : "उदा. राजेश पाटील किंवा Walk-in customer"
                    }
                    placeholderTextColor="#9CA3AF"
                  />
                  {errors.customerName ? (
                    <Text style={styles.errorText}>{errors.customerName}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.formLabel}>
                    {language === "en" ? "Member *" : "सदस्य *"}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.input,
                      styles.pickerInput,
                      errors.studentId && styles.inputError,
                    ]}
                    onPress={() => setShowMemberPicker((v) => !v)}
                  >
                    <Text
                      style={
                        form.studentId
                          ? styles.pickerText
                          : styles.placeholderText
                      }
                    >
                      {form.studentId
                        ? form.customerName
                        : language === "en"
                        ? "Select member"
                        : "सदस्य निवडा"}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#6B7280" />
                  </TouchableOpacity>
                  {showMemberPicker && (
                    <View style={styles.dropdownOptions}>
                      <TextInput
                        style={styles.dropdownSearchInput}
                        value={memberSearch}
                        onChangeText={setMemberSearch}
                        placeholder={
                          language === "en"
                            ? "Search by name, roll or room"
                            : "नाव, रोल किंवा रूमने शोधा"
                        }
                        placeholderTextColor="#9CA3AF"
                      />
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator
                      >
                        {filteredMembers.map((m) => (
                          <TouchableOpacity
                            key={m._id}
                            style={styles.dropdownOption}
                            onPress={() => {
                              setForm((f) => ({
                                ...f,
                                studentId: m._id,
                                customerName: m.name || "",
                              }));
                              setErrors((e) => ({
                                ...e,
                                studentId: null,
                              }));
                              setShowMemberPicker(false);
                            }}
                          >
                            <Text style={styles.dropdownOptionText}>
                              {language === "mr" ? m.nameMr || m.name : m.name}{" "}
                              {m.rollNumber ||
                              m.roomNumber ||
                              (language === "mr"
                                ? m.roomOwnerNameMr || m.roomOwnerName
                                : m.roomOwnerName)
                                ? `(${
                                    m.rollNumber ||
                                    m.roomNumber ||
                                    (language === "mr"
                                      ? m.roomOwnerNameMr || m.roomOwnerName
                                      : m.roomOwnerName)
                                  })`
                                : ""}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {filteredMembers.length === 0 ? (
                          <Text style={styles.emptyDropdownText}>
                            {language === "en"
                              ? "No members match your search"
                              : "तुमच्या शोधाशी जुळणारा सदस्य नाही"}
                          </Text>
                        ) : null}
                      </ScrollView>
                    </View>
                  )}
                  {errors.studentId ? (
                    <Text style={styles.errorText}>{errors.studentId}</Text>
                  ) : null}
                </>
              )}

              <Text style={styles.formLabel}>
                {language === "en" ? "Snack Item *" : "स्नॅक आयटम *"}
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.pickerInput,
                  errors.snackItem && styles.inputError,
                ]}
                onPress={() => setShowSnackPicker((v) => !v)}
              >
                <Text
                  style={
                    snackItemDisplay ? styles.pickerText : styles.placeholderText
                  }
                >
                  {snackItemDisplay ||
                    (language === "en"
                      ? "Select snack item"
                      : "स्नॅक आयटम निवडा")}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showSnackPicker && (
                <View style={styles.dropdownOptions}>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {snackProductsForDropdown.map((p) => (
                      <TouchableOpacity
                        key={p._id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setForm((f) => ({
                            ...f,
                            snackProductId: p._id,
                            snackItem: p.name,
                            pricePerItem: String(p.price),
                          }));
                          setErrors((e) => ({ ...e, snackItem: null }));
                          setShowSnackPicker(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>
                          {language === "mr" ? p.nameMr || p.name : p.name} · ₹
                          {Number(p.price || 0).toLocaleString("en-IN")}{" "}
                          {p.category ? `(${p.category})` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {snackProductsForDropdown.length === 0 ? (
                      <Text style={styles.emptyDropdownText}>
                        {language === "en"
                          ? "No snack items available"
                          : "कोणतेही स्नॅक आयटम उपलब्ध नाहीत"}
                      </Text>
                    ) : null}
                  </ScrollView>
                </View>
              )}
              {errors.snackItem ? (
                <Text style={styles.errorText}>{errors.snackItem}</Text>
              ) : null}

              <Text style={styles.formLabel}>
                {language === "en" ? "Quantity *" : "प्रमाण *"}
              </Text>
              <TextInput
                style={[styles.input, errors.quantity && styles.inputError]}
                value={form.quantity}
                onChangeText={(v) => {
                  setForm((f) => ({ ...f, quantity: v }));
                  setErrors((e) => ({ ...e, quantity: null }));
                }}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
              {errors.quantity ? (
                <Text style={styles.errorText}>{errors.quantity}</Text>
              ) : null}

              <Text style={styles.formLabel}>
                {language === "en" ? "Total Price" : "एकूण रक्कम"}
              </Text>
              <View style={styles.totalDisplay}>
                <Text style={styles.totalDisplayText}>{formatCurrency(totalPrice)}</Text>
                <Text style={styles.totalHint}>Auto calculated</Text>
              </View>

              <Text style={styles.formLabel}>
                {language === "en" ? "Date *" : "तारीख *"}
              </Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.date && styles.inputError]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.pickerText}>{formatDisplayDate(form.date)}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={form.date}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                  maximumDate={new Date()}
                />
              )}
              {errors.date ? (
                <Text style={styles.errorText}>{errors.date}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId
                      ? language === "en"
                        ? "Update Order"
                        : "ऑर्डर अपडेट करा"
                      : language === "en"
                      ? "Save Order"
                      : "ऑर्डर जतन करा"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

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
  topSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  revenueCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  revenueLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 4,
  },
  revenueAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
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
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
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
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  cardTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginLeft: 8,
  },
  cardValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "500",
    marginLeft: 4,
  },
  cardDate: {
    fontSize: 13,
    color: "#6B7280",
    marginLeft: 8,
  },
  cardActions: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#DC2626",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
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
  modalClose: {
    padding: 4,
  },
  formScroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  pickerInput: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    fontSize: 16,
    color: "#111827",
  },
  placeholderText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  totalDisplay: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalDisplayText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  totalHint: {
    fontSize: 12,
    color: "#6B7280",
  },
  dropdownOptions: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 8,
    maxHeight: 220,
    overflow: "hidden",
  },
  dropdownOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownOptionText: {
    fontSize: 16,
    color: "#111827",
  },
  emptyDropdownText: {
    fontSize: 14,
    color: "#6B7280",
    padding: 14,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
  },
  customerTypeToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  customerTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 6,
  },
  customerTypeLabel: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  dropdownSearchInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    fontSize: 14,
    color: "#111827",
  },
  saveButton: {
    marginTop: 24,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

