import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
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
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { displayStatusMr } from "../../lib/memberLabelsMr";
import { fetchMemberDirectory } from "../../lib/memberDirectory";

const INITIAL_FORM = {
  name: "",
  nameMr: "",
  roomOwnerName: "",
  roomOwnerNameMr: "",
  phone: "",
  email: "",
  // Used only when editing an existing member.
  password: "",
  joiningDate: new Date().toISOString().split("T")[0],
  // Only editable on "Add Member" flow (hidden on edit).
  status: "Active",
  mealPlan: "Lunch",
};

const ManageMembers = () => {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

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

  const openAddModal = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
  };

  const validateForm = () => {
    const name = formData.name?.trim() || "";
    const roomOwnerName = formData.roomOwnerName?.trim() || "";
    const phone = formData.phone?.trim() || "";
    const email = formData.email?.trim() || "";
    const joiningDate = formData.joiningDate?.trim() || "";
    const password = formData.password?.trim() || "";

    if (!name || !roomOwnerName || !phone) {
      return t("manage_members_validation_required");
    }

    // On "Add Member", password must be provided.
    if (!editingId && !password) {
      return (
        t("manage_members_validation_password_required") ||
        "Please enter password"
      );
    }

    if (name.length < 2) {
      return t("manage_members_validation_name_min");
    }

    if (!/^[A-Za-z\s.\u0900-\u097F]+$/u.test(name)) {
      return t("manage_members_validation_name_chars");
    }

    if (!/^[A-Za-z\s.\u0900-\u097F]+$/u.test(roomOwnerName)) {
      return t("manage_members_validation_room_chars");
    }

    if (!/^[0-9]{7,15}$/.test(phone.replace(/\D/g, ""))) {
      return t("manage_members_validation_phone");
    }

    if (email) {
      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return t("manage_members_validation_email");
      }
    }

    if (joiningDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(joiningDate)) {
        return t("manage_members_validation_joining_format");
      }
      const parsed = new Date(joiningDate);
      if (isNaN(parsed.getTime())) {
        return t("manage_members_validation_joining_invalid");
      }
    }

    // Only validate status/mealPlan when adding a new member (these fields are hidden on edit).
    if (!editingId) {
      if (formData.status !== "Active" && formData.status !== "Inactive") {
        return t("manage_members_validation_status");
      }

      if (
        formData.mealPlan !== "Lunch" &&
        formData.mealPlan !== "Dinner" &&
        formData.mealPlan !== "Both"
      ) {
        return t("manage_members_validation_meal_plan");
      }
    }

    return null;
  };

  const handleSubmit = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert(t("alert_validation_title"), error);
      return;
    }

    const nameMrTrim = formData.nameMr?.trim() || "";
    const roomOwnerMrTrim = formData.roomOwnerNameMr?.trim() || "";

    const trimmedNewPassword = formData.password?.trim() || "";

    const payload = {
      name: formData.name.trim(),
      roomOwnerName: formData.roomOwnerName.trim(),
      // Explicit Marathi (optional). If omitted, backend translates EN → MR when possible.
      nameMr: nameMrTrim,
      roomOwnerNameMr: roomOwnerMrTrim,
      phone: formData.phone.trim(),
      email: formData.email?.trim() || "",
      ...(!editingId
        ? {
            // Joining date is editable only on "Add Member" flow.
            joiningDate: formData.joiningDate?.trim() || new Date().toISOString().split("T")[0],
          }
        : {}),
      ...(!editingId
        ? {
            status: formData.status === "Inactive" ? "Inactive" : "Active",
            mealPlan:
              formData.mealPlan === "Dinner"
                ? "Dinner"
                : formData.mealPlan === "Both"
                  ? "Both"
                  : "Lunch",
          }
        : {}),
      // For new members, password is required and is stored (hashed) in the backend.
      // For edits: if admin filled a new password, update it; otherwise keep unchanged.
      ...(editingId
        ? trimmedNewPassword
          ? { password: trimmedNewPassword }
          : {}
        : { password: formData.password.trim() }),
    };

    try {
      setSubmitting(true);
      if (editingId) {
        const res = await api.put(`/api/members/${editingId}`, payload);
        Alert.alert(
          t("alert_success"),
          t("manage_members_alert_member_updated")
        );
        setStudents((prev) =>
          prev.map((s) => (s._id === editingId ? res.data : s))
        );
      } else {
        const res = await api.post("/api/members", payload);
        Alert.alert(
          t("alert_success"),
          t("manage_members_alert_member_added")
        );
        setStudents((prev) => [res.data, ...prev]);
      }
      closeModal();
      fetchStudents();
    } catch (err) {
      Alert.alert(
        t("alert_error"),
        err?.response?.data?.message || t("manage_members_alert_generic_error")
      );
    } finally {
      setSubmitting(false);
    }
  };

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

  const renderFormField = (label, value, onChange, placeholder, keyboardType) => (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType || "default"}
        placeholderTextColor="#9CA3AF"
      />
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

      <TouchableOpacity
        style={styles.addButton}
        onPress={openAddModal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color="#FFFFFF" />
        <Text style={styles.addButtonText}>
          {language === "en" ? "Add Member" : "सदस्य जोडा"}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item) => item._id}
          renderItem={renderStudentCard}
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
                  ? "No members yet. Add one!"
                  : "अजून कोणतेही सदस्य नाहीत. नवीन सदस्य जोडा!"}
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
                {editingId
                  ? language === "en"
                    ? "Edit Member"
                    : "सदस्य संपादित करा"
                  : language === "en"
                  ? "Add Member"
                  : "सदस्य जोडा"}
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
                t("manage_members_member_name_label"),
                formData.name,
                (v) => setFormData((p) => ({ ...p, name: v })),
                t("manage_members_member_name_placeholder")
              )}
              {renderFormField(
                t("manage_members_room_owner_label"),
                formData.roomOwnerName,
                (v) => setFormData((p) => ({ ...p, roomOwnerName: v })),
                t("manage_members_room_owner_placeholder")
              )}
              {renderFormField(
                language === "en" ? "Phone Number" : "फोन नंबर",
                formData.phone,
                (v) => setFormData((p) => ({ ...p, phone: v })),
                "e.g. 9876543210",
                "phone-pad"
              )}
              {renderFormField(
                language === "en" ? "Email" : "ईमेल",
                formData.email,
                (v) => setFormData((p) => ({ ...p, email: v })),
                "e.g. john@example.com",
                "email-address"
              )}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>
                  {editingId
                    ? language === "en"
                      ? "New Password"
                      : "नवीन पासवर्ड"
                    : language === "en"
                      ? "Password"
                      : "पासवर्ड"}
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.password}
                  onChangeText={(v) => setFormData((p) => ({ ...p, password: v }))}
                  placeholder={
                    editingId
                      ? language === "en"
                        ? "Leave blank to keep current password"
                        : "सध्याचा पासवर्ड ठेवण्यासाठी रिक्त ठेवा"
                      : language === "en"
                        ? "Enter password"
                        : "पासवर्ड टाका"
                  }
                  secureTextEntry
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {renderFormField(
                language === "en" ? "Joining Date" : "जॉइनिंग तारीख",
                formData.joiningDate,
                !editingId
                  ? (v) => setFormData((p) => ({ ...p, joiningDate: v }))
                  : () => {},
                "YYYY-MM-DD"
              )}

              {!editingId ? (
                <>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>
                      {language === "en" ? "Meal Plan" : "जेवण योजना"}
                    </Text>
                    <View style={styles.mealPlanSelector}>
                      <TouchableOpacity
                        style={[
                          styles.mealPlanOption,
                          formData.mealPlan === "Lunch" &&
                            styles.mealPlanOptionSelected,
                        ]}
                        onPress={() =>
                          setFormData((p) => ({ ...p, mealPlan: "Lunch" }))
                        }
                      >
                        <Text
                          style={[
                            styles.mealPlanOptionText,
                            formData.mealPlan === "Lunch" &&
                              styles.mealPlanOptionTextSelected,
                          ]}
                        >
                          {language === "en" ? "Lunch" : "दुपारचे जेवण"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.mealPlanOption,
                          formData.mealPlan === "Dinner" &&
                            styles.mealPlanOptionSelected,
                        ]}
                        onPress={() =>
                          setFormData((p) => ({ ...p, mealPlan: "Dinner" }))
                        }
                      >
                        <Text
                          style={[
                            styles.mealPlanOptionText,
                            formData.mealPlan === "Dinner" &&
                              styles.mealPlanOptionTextSelected,
                          ]}
                        >
                          {language === "en" ? "Dinner" : "रात्रीचे जेवण"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.mealPlanOption,
                          formData.mealPlan === "Both" &&
                            styles.mealPlanOptionSelected,
                        ]}
                        onPress={() =>
                          setFormData((p) => ({ ...p, mealPlan: "Both" }))
                        }
                      >
                        <Text
                          style={[
                            styles.mealPlanOptionText,
                            formData.mealPlan === "Both" &&
                              styles.mealPlanOptionTextSelected,
                          ]}
                        >
                          {language === "en" ? "Both" : "दोन्ही"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>
                      {language === "en" ? "Status" : "स्थिती"}
                    </Text>
                    <View style={styles.statusSelector}>
                      <TouchableOpacity
                        style={[
                          styles.statusOption,
                          formData.status === "Active" &&
                            styles.statusOptionActive,
                        ]}
                        onPress={() =>
                          setFormData((p) => ({ ...p, status: "Active" }))
                        }
                      >
                        <Text
                          style={[
                            styles.statusOptionText,
                            formData.status === "Active" &&
                              styles.statusOptionTextActive,
                          ]}
                        >
                          {language === "en" ? "Active" : "सक्रिय"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.statusOption,
                          formData.status === "Inactive" &&
                            styles.statusOptionInactive,
                        ]}
                        onPress={() =>
                          setFormData((p) => ({ ...p, status: "Inactive" }))
                        }
                      >
                        <Text
                          style={[
                            styles.statusOptionText,
                            formData.status === "Inactive" &&
                              styles.statusOptionTextInactive,
                          ]}
                        >
                          {language === "en" ? "Inactive" : "निष्क्रिय"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}

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
                        ? "Update Member"
                        : "सदस्य अपडेट करा"
                      : language === "en"
                      ? "Add Member"
                      : "सदस्य जोडा"}
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "95%",
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
  formScrollView: {
    maxHeight: Dimensions.get("window").height * 0.75,
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
  statusSelector: {
    flexDirection: "row",
    gap: 12,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  statusOptionActive: {
    backgroundColor: "#111827",
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
  mealPlanSelector: {
    flexDirection: "row",
    gap: 12,
  },
  mealPlanOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  mealPlanOptionSelected: {
    backgroundColor: "#111827",
  },
  mealPlanOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  mealPlanOptionTextSelected: {
    color: "#FFFFFF",
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

