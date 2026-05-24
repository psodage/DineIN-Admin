import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";

const CATEGORIES = ["Beverage", "Food", "Other"];

const CATEGORY_LABELS_MR = {
  Beverage: "पेय",
  Food: "खाद्य",
  Other: "इतर",
};

const ManageExtraSnacks = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();

  const [snacks, setSnacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSnack, setEditingSnack] = useState(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("Other");
  const [availability, setAvailability] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const fetchSnacks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/snack-products");
      setSnacks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Failed to load extra snacks"
      );
      setSnacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) {
      fetchSnacks();
    }
  }, [authLoading, isAuthenticated, fetchSnacks]);

  const openAddModal = () => {
    setEditingSnack(null);
    setName("");
    setPrice("");
    setQuantity("0");
    setCategory("Other");
    // If stock is 0, force Not Available.
    setAvailability(false);
    setShowCategoryPicker(false);
    setModalVisible(true);
  };

  const openEditModal = (item) => {
    setEditingSnack(item);
    // Admin inputs EN only; fallback to MR if EN isn't present yet.
    setName(item.name || item.nameMr || "");
    setPrice(String(item.price ?? ""));
    const q = Number(item.quantity ?? 0);
    setQuantity(String(q));
    setCategory(item.category || "Other");
    // Enforce: quantity 0 => Not Available, quantity > 0 => Available.
    setAvailability(q > 0);
    setShowCategoryPicker(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingSnack(null);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const numPrice = Number(price);
    const numQuantity = Number(quantity);
    if (!trimmedName) {
      Alert.alert("Validation", "Snack name is required.");
      return;
    }
    if (isNaN(numPrice) || numPrice < 0) {
      Alert.alert("Validation", "Price must be a valid non-negative number.");
      return;
    }
    if (isNaN(numQuantity) || numQuantity < 0) {
      Alert.alert(
        "Validation",
        "Quantity must be a valid non-negative number."
      );
      return;
    }

    // Enforce: quantity 0 => Not Available, quantity > 0 => Available.
    const enforcedAvailability = numQuantity > 0;
    const payload = {
      name: trimmedName,
      // Store MR automatically from the same English input.
      nameMr: trimmedName,
      price: numPrice,
      quantity: numQuantity,
      category,
      availability: enforcedAvailability,
    };

    try {
      setSaving(true);
      if (editingSnack) {
        await api.put(
          `/api/snack-products/update/${editingSnack._id}`,
          payload
        );
      } else {
        await api.post("/api/snack-products/add", payload);
      }
      closeModal();
      fetchSnacks();
    } catch (err) {
      Alert.alert(
        "Error",
        err?.response?.data?.message || "Failed to save snack product"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item) => {
    const displayName =
      language === "mr" ? item.nameMr || item.name : item.name;
    Alert.alert(
      "Delete Snack",
      `Are you sure you want to delete ${displayName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/api/snack-products/delete/${item._id}`);
              fetchSnacks();
            } catch (err) {
              Alert.alert(
                "Error",
                err?.response?.data?.message || "Failed to delete snack product"
              );
            }
          },
        },
      ]
    );
  };

  const renderSnackItem = ({ item }) => {
    const qty = Number(item.quantity ?? 0);
    const isAvailable = qty > 0 && item.availability !== false;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {language === "mr" ? item.nameMr || item.name : item.name}
            </Text>
            <Text style={styles.cardSubtitle}>
              ₹{Number(item.price || 0).toLocaleString("en-IN")} ·{" "}
              Qty: {qty} ·{" "}
              {language === "mr"
                ? CATEGORY_LABELS_MR[item.category] || item.category || "इतर"
                : item.category || "Other"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isAvailable ? styles.statusAvailable : styles.statusUnavailable,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isAvailable ? styles.statusTextAvailable : styles.statusTextUnavailable,
              ]}
            >
              {isAvailable ? "Available" : "Not Available"}
            </Text>
          </View>
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
          {language === "en" ? "Manage Extra Snacks" : "अतिरिक्त स्नॅक्स व्यवस्थापन"}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openAddModal}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {language === "en" ? "Add Snack" : "स्नॅक जोडा"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={snacks}
          keyExtractor={(item) => item._id}
          renderItem={renderSnackItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="fast-food-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                {language === "en"
                  ? "No snack products yet. Add one!"
                  : "अजून कोणतेही स्नॅक्स नाहीत. नवीन स्नॅक जोडा!"}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

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
                {editingSnack
                  ? language === "en"
                    ? "Edit Snack"
                    : "स्नॅक संपादित करा"
                  : language === "en"
                  ? "Add Snack"
                  : "स्नॅक जोडा"}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.formLabel}>
                {language === "en" ? "Snack Name *" : "स्नॅकचे नाव *"}
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={
                  language === "en" ? "e.g. Samosa" : "उदा. समोसा"
                }
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.formLabel}>
                {language === "en" ? "Price (₹) *" : "किंमत (₹) *"}
              </Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>
                {language === "en" ? "Quantity (units) *" : "प्रमाण (युनिट) *"}
              </Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={(v) => {
                  setQuantity(v);
                  const q = Number(v);
                  if (Number.isNaN(q)) return;
                  if (q <= 0) setAvailability(false);
                  else setAvailability(true);
                }}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.formLabel}>
                {language === "en" ? "Category" : "वर्ग"}
              </Text>
              <TouchableOpacity
                style={styles.pickerInput}
                onPress={() => setShowCategoryPicker((v) => !v)}
              >
                <Text style={styles.pickerText}>
                  {language === "mr"
                    ? CATEGORY_LABELS_MR[category] || category
                    : category}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {showCategoryPicker && (
                <View style={styles.pickerOptions}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.pickerOption}
                      onPress={() => {
                        setCategory(cat);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={styles.pickerOptionText}>
                        {language === "mr"
                          ? CATEGORY_LABELS_MR[cat] || cat
                          : cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.formLabel}>
                {language === "en" ? "Availability" : "उपलब्धता"}
              </Text>
              <View style={styles.statusSelector}>
                <TouchableOpacity
                  style={[
                    styles.statusOption,
                    availability && styles.statusOptionActive,
                  ]}
                  onPress={() => setAvailability(true)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      availability && styles.statusOptionTextActive,
                    ]}
                  >
                    {language === "en" ? "Available" : "उपलब्ध"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.statusOption,
                    !availability && styles.statusOptionInactive,
                  ]}
                  onPress={() => setAvailability(false)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      !availability && styles.statusOptionTextInactive,
                    ]}
                  >
                    {language === "en" ? "Not Available" : "उपलब्ध नाही"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saving && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {language === "en" ? "Save" : "जतन करा"}
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

export default ManageExtraSnacks;

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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusAvailable: {
    backgroundColor: "#D1FAE5",
  },
  statusUnavailable: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusTextAvailable: {
    color: "#065F46",
  },
  statusTextUnavailable: {
    color: "#991B1B",
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
  statusSelector: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  statusOptionActive: {
    backgroundColor: "#16A34A",
  },
  statusOptionInactive: {
    backgroundColor: "#DC2626",
  },
  statusOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  statusOptionTextActive: {
    color: "#FFFFFF",
  },
  statusOptionTextInactive: {
    color: "#FFFFFF",
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

