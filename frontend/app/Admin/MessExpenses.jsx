import React, { useState, useEffect } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import api from "../../lib/api";
import { useLanguage } from "../../LanguageContext";
import {
  clampYearMonthToSelectableWindow,
  combineMinYearMonth,
  getCurrentYearMonth,
  getMaxSelectableYearMonth,
  stepNextYearMonth,
  stepPrevYearMonth,
} from "../../lib/monthNavigation";

const CATEGORIES = [
  "Vegetables",
  "Milk",
  "Grocery",
  "Gas",
  "Maintenance",
  "Other",
];

const CATEGORY_LABELS_MR = {
  Vegetables: "भाज्या",
  Milk: "दुग्ध",
  Grocery: "किराणा",
  Gas: "गॅस",
  Maintenance: "देखभाल",
  Other: "इतर",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_MR = [
  "जानेवारी",
  "फेब्रुवारी",
  "मार्च",
  "एप्रिल",
  "मे",
  "जून",
  "जुलै",
  "ऑगस्ट",
  "सप्टेंबर",
  "ऑक्टोबर",
  "नोव्हेंबर",
  "डिसेंबर",
];

const formatDisplayDate = (d, lang = "en") => {
  const date = d instanceof Date ? d : new Date(d);
  const locale = lang === "mr" ? "mr-IN" : "en-IN";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (amount) => {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
};

const getMonthLabel = (yearMonth, lang = "en") => {
  const year = Math.floor(yearMonth / 12);
  const month = yearMonth % 12;
  const names = lang === "mr" ? MONTH_NAMES_MR : MONTH_NAMES;
  return `${names[month]} ${year}`;
};

export default function MessExpenses() {
  const router = useRouter();
  const { language } = useLanguage();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    clampYearMonthToSelectableWindow(getCurrentYearMonth())
  );
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    category: "",
    amount: "",
    date: new Date(),
    description: "",
  });
  const [errors, setErrors] = useState({});

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/expenses");
      setExpenses(res.data);
    } catch (err) {
      const title = language === "en" ? "Error" : "त्रुटी";
      const msg =
        err.response?.data?.message ||
        (language === "en"
          ? "Failed to fetch expenses"
          : "खर्च मिळवण्यात अयशस्वी");
      Alert.alert(title, msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setForm({
      title: "",
      category: "",
      amount: "",
      date: new Date(),
      description: "",
    });
    setErrors({});
    setFormVisible(true);
  };

  const openEditForm = (exp) => {
    setEditingId(exp._id);
    setForm({
      title: exp.title || exp.titleMr || "",
      category: exp.category,
      amount: String(exp.amount),
      date: new Date(exp.date),
      description: exp.description || exp.descriptionMr || "",
    });
    setErrors({});
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingId(null);
    setShowCategoryPicker(false);
    setShowDatePicker(false);
  };

  const validate = () => {
    const e = {};
    const en = language === "en";
    if (!form.title.trim())
      e.title = en ? "Title is required" : "शीर्षक आवश्यक आहे";
    if (!form.category)
      e.category = en ? "Category is required" : "विभाग आवश्यक आहे";
    if (!form.amount.trim())
      e.amount = en ? "Amount is required" : "रक्कम आवश्यक आहे";
    else if (isNaN(Number(form.amount)) || Number(form.amount) < 0)
      e.amount = en ? "Enter a valid amount" : "वैध रक्कम प्रविष्ट करा";
    if (!form.date)
      e.date = en ? "Date is required" : "तारीख आवश्यक आहे";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = {
        title: form.title.trim(),
        titleMr: form.title.trim(),
        category: form.category,
        amount: Number(form.amount),
        date: form.date.toISOString(),
        description: form.description.trim(),
        descriptionMr: form.description.trim(),
      };
      if (editingId) {
        await api.put(`/api/expenses/${editingId}`, payload);
        Alert.alert(
          language === "en" ? "Success" : "यशस्वी",
          language === "en"
            ? "Expense updated successfully"
            : "खर्च यशस्वीरित्या अपडेट झाला"
        );
      } else {
        await api.post("/api/expenses", payload);
        Alert.alert(
          language === "en" ? "Success" : "यशस्वी",
          language === "en"
            ? "Expense added successfully"
            : "खर्च यशस्वीरित्या जोडला गेला"
        );
      }
      closeForm();
      fetchExpenses();
    } catch (err) {
      Alert.alert(
        language === "en" ? "Error" : "त्रुटी",
        err.response?.data?.message ||
          (language === "en"
            ? "Failed to save expense"
            : "खर्च जतन करण्यात अयशस्वी")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (exp) => {
    const displayTitle =
      language === "mr" ? exp.titleMr || exp.title : exp.title;
    Alert.alert(
      language === "en" ? "Delete expense" : "खर्च हटवा",
      language === "en"
        ? `Are you sure you want to delete "${displayTitle}"?`
        : `तुम्हाला खात्री आहे की "${displayTitle}" हटवायचे आहे?`,
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
              await api.delete(`/api/expenses/${exp._id}`);
              fetchExpenses();
            } catch (err) {
              Alert.alert(
                language === "en" ? "Error" : "त्रुटी",
                err.response?.data?.message ||
                  (language === "en"
                    ? "Failed to delete expense"
                    : "खर्च हटवण्यात अयशस्वी")
              );
            }
          },
        },
      ]
    );
  };

  const allExpenseMonths = expenses
    .map((e) => {
      const d = new Date(e.date);
      return d.getFullYear() * 12 + d.getMonth();
    })
    .filter((ym) => !Number.isNaN(ym));
  const minExpenseMonth = combineMinYearMonth(
    allExpenseMonths.length > 0 ? Math.min(...allExpenseMonths) : getCurrentYearMonth(0)
  );

  useEffect(() => {
    setSelectedMonth((m) =>
      clampYearMonthToSelectableWindow(m, minExpenseMonth, getMaxSelectableYearMonth())
    );
  }, [minExpenseMonth, expenses.length]);

  const monthExpenses = expenses.filter((e) => {
    const d = new Date(e.date);
    const ym = d.getFullYear() * 12 + d.getMonth();
    return ym === selectedMonth;
  });

  const totalAmount = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) setForm((f) => ({ ...f, date: selectedDate }));
  };

  const renderExpenseCard = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {language === "mr" ? item.titleMr || item.title : item.title}
        </Text>
        <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {language === "mr"
              ? CATEGORY_LABELS_MR[item.category] || item.category
              : item.category}
          </Text>
        </View>
        <Text style={styles.cardDate}>
          {formatDisplayDate(item.date, language)}
        </Text>
      </View>
      {(language === "mr" ? item.descriptionMr || item.description : item.description) ? (
        <Text style={styles.cardDescription}>
          {language === "mr"
            ? item.descriptionMr || item.description
            : item.description}
        </Text>
      ) : null}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => openEditForm(item)}
        >
          <Ionicons name="pencil" size={18} color="#FFFFFF" />
          <Text style={styles.editButtonText}>
            {language === "en" ? "Edit" : "संपादन"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
        >
          <Ionicons name="trash" size={18} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>
            {language === "en" ? "Delete" : "हटवा"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>
          {language === "en" ? "Mess Expenses" : "मेस खर्च"}
        </Text>
      </View>

      <View style={styles.topSection}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {language === "en" ? "Total Expenses" : "एकूण खर्च"}{" "}
            ({getMonthLabel(selectedMonth, language)})
          </Text>
          <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
        </View>
        <View style={styles.monthNav}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={() => setSelectedMonth((m) => stepPrevYearMonth(m, minExpenseMonth))}
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddForm}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {language === "en" ? "Add Expense" : "खर्च जोडा"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={monthExpenses}
          keyExtractor={(item) => item._id}
          renderItem={renderExpenseCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {language === "en"
                ? "No expenses for this month"
                : "या महिन्यासाठी कोणताही खर्च नोंदलेला नाही"}
            </Text>
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
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId
                  ? language === "en"
                    ? "Edit Expense"
                    : "खर्च संपादित करा"
                  : language === "en"
                  ? "Add Expense"
                  : "खर्च जोडा"}
              </Text>
              <TouchableOpacity onPress={closeForm}>
                <Ionicons name="close" size={24} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>
                {language === "en"
                  ? "Expense title (English or Marathi) *"
                  : "खर्चाचे शीर्षक (इंग्रजी किंवा मराठी) *"}
              </Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={form.title}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, title: t }));
                  setErrors((e) => ({ ...e, title: null }));
                }}
                placeholder={
                  language === "en"
                    ? "e.g. Monthly vegetables or मासिक भाज्या"
                    : "उदा. Monthly vegetables किंवा मासिक भाज्या"
                }
                placeholderTextColor="#9CA3AF"
              />
              {errors.title ? (
                <Text style={styles.errorText}>{errors.title}</Text>
              ) : null}

              <Text style={styles.label}>
                {language === "en" ? "Category *" : "विभाग *"}
              </Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.category && styles.inputError]}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text
                  style={
                    form.category
                      ? styles.pickerText
                      : styles.placeholderText
                  }
                >
                  {form.category ||
                    (language === "en" ? "Select category" : "विभाग निवडा")}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {errors.category ? (
                <Text style={styles.errorText}>{errors.category}</Text>
              ) : null}

              {showCategoryPicker && (
                <View style={styles.categoryOptions}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.categoryOption}
                      onPress={() => {
                        setForm((f) => ({ ...f, category: cat }));
                        setShowCategoryPicker(false);
                        setErrors((e) => ({ ...e, category: null }));
                      }}
                    >
                      <Text style={styles.categoryOptionText}>
                        {language === "mr"
                          ? CATEGORY_LABELS_MR[cat] || cat
                          : cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>
                {language === "en" ? "Amount *" : "रक्कम *"}
              </Text>
              <TextInput
                style={[styles.input, errors.amount && styles.inputError]}
                value={form.amount}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, amount: t }));
                  setErrors((e) => ({ ...e, amount: null }));
                }}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
              {errors.amount ? (
                <Text style={styles.errorText}>{errors.amount}</Text>
              ) : null}

              <Text style={styles.label}>
                {language === "en" ? "Date *" : "तारीख *"}
              </Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.date && styles.inputError]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.pickerText}>
                  {formatDisplayDate(form.date, language)}
                </Text>
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

              <Text style={styles.label}>
                {language === "en"
                  ? "Description (English or Marathi, optional)"
                  : "वर्णन (इंग्रजी किंवा मराठी, पर्यायी)"}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  errors.description && styles.inputError,
                ]}
                value={form.description}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, description: t }));
                  setErrors((e) => ({ ...e, description: null }));
                }}
                placeholder={
                  language === "en" ? "Add notes…" : "टीपा जोडा…"
                }
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId
                      ? language === "en"
                        ? "Update"
                        : "अपडेट करा"
                      : language === "en"
                      ? "Save"
                      : "जतन करा"}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  topSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  totalCard: {
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
  totalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 4,
  },
  totalAmount: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
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
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  cardDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  cardDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  editButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#DC2626",
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
    color: "#6B7280",
    marginTop: 40,
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
    marginHorizontal: 20,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  inputError: {
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
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  categoryOptions: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  categoryOptionText: {
    fontSize: 16,
    color: "#111827",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
    marginHorizontal: 20,
  },
  saveButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 32,
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

