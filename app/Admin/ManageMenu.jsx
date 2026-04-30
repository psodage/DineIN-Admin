import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import api from "../../lib/api";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";
import { getDefaultMessMenuForDate } from "../../lib/defaultMessMenu";
import { formatPollQuestion, formatPollOptionLabel } from "../../lib/memberLabelsMr";
import { useAuth } from "../../lib/AuthContext";

const DEFAULT_POLL_OPTIONS = [
  { key: "option1", label: "", labelMr: "" },
  { key: "option2", label: "", labelMr: "" },
];

const getDefaultPollTemplate = (language) =>
  language === "mr"
    ? {
        question: "जेवणाची पसंती",
        options: DEFAULT_POLL_OPTIONS.map((o) => ({ ...o })),
      }
    : {
        question: "Meal Preference",
        options: DEFAULT_POLL_OPTIONS.map((o) => ({ ...o })),
      };

const formatDisplayDate = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/** Local calendar YYYY-MM-DD for “is this day in the past?” (menus). */
const localDateKey = (dateLike) => {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Polls are stored at UTC midnight of a bucket day.
 * For UI comparisons, use the device local calendar day (YYYY-MM-DD) consistently.
 */
const pollDateKeyFromPollDoc = (p) => localDateKey(p?.date);

const menuLine = (item, language, field) => {
  const en = item?.[field];
  const mr = item?.[`${field}Mr`];
  return language === "mr" ? String(mr || en || "").trim() : String(en || mr || "").trim();
};

/** Stable id for new poll options (votes key off `key`; hidden from admin UI). */
const newPollOptionKey = () =>
  `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const MenuFormModal = ({
  visible,
  onClose,
  onSave,
  initialData,
  isEditing,
  pollOptions,
  language,
  t,
}) => {
  const [date, setDate] = useState(initialData?.date ? new Date(initialData.date) : new Date());
  const [lunch, setLunch] = useState(
    initialData ? menuLine(initialData, language, "lunch") : ""
  );
  const [dinner, setDinner] = useState(
    initialData ? menuLine(initialData, language, "dinner") : ""
  );
  const [selectedOptionKey, setSelectedOptionKey] = useState(
    initialData?.pollOptionKey || ""
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialData) {
        setDate(initialData.date ? new Date(initialData.date) : new Date());
        setLunch(menuLine(initialData, language, "lunch") || "");
        setDinner(menuLine(initialData, language, "dinner") || "");
        setSelectedOptionKey(initialData.pollOptionKey || "");
      } else {
        setDate(new Date());
        setLunch("");
        setDinner("");
        setSelectedOptionKey(
          Array.isArray(pollOptions) && pollOptions.length > 0
            ? pollOptions[0]?.key || ""
            : ""
        );
      }
    }
  }, [visible, initialData, language, pollOptions]);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) setDate(selectedDate);
  };

  const handleSave = async () => {
    const l = lunch.trim();
    const d = dinner.trim();

    // Allow saving when at least one meal is provided.
    // (Admin may intentionally leave either lunch or dinner empty.)
    if (!l && !d) {
      Alert.alert(t("alert_validation_title"), t("manage_menu_validation_lunch_dinner"));
      return;
    }

    const selectedOption = (Array.isArray(pollOptions) ? pollOptions : []).find(
      (o) => o.key === selectedOptionKey
    );
    if ((Array.isArray(pollOptions) ? pollOptions : []).length > 0 && !selectedOption) {
      Alert.alert(
        t("alert_validation_title"),
        language === "en"
          ? "Please select a menu category"
          : "कृपया मेनू श्रेणी निवडा"
      );
      return;
    }

    const fallbackOptionPayload = selectedOptionKey
      ? {
          pollOptionKey: selectedOptionKey,
          pollOptionLabel: String(initialData?.pollOptionLabel || "").trim(),
          pollOptionLabelMr: String(
            initialData?.pollOptionLabelMr || initialData?.pollOptionLabel || ""
          ).trim(),
        }
      : {
          pollOptionKey: "",
          pollOptionLabel: "",
          pollOptionLabelMr: "",
        };

    setSaving(true);
    try {
      await onSave({
        date: date.toISOString(),
        lunch: l,
        dinner: d,
        ...(selectedOption
          ? {
              pollOptionKey: selectedOption.key,
              pollOptionLabel: selectedOption.label || "",
              pollOptionLabelMr:
                selectedOption.labelMr || selectedOption.label || "",
            }
          : fallbackOptionPayload),
      });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || t("manage_menu_menu_save_failed");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isEditing ? t("manage_menu_edit_menu") : t("manage_menu_add_menu")}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{t("manage_menu_date")}</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateText}>{formatDisplayDate(date)}</Text>
              <Ionicons name="calendar-outline" size={20} color="#6B7280" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDateChange}
                style={Platform.OS === "ios" ? styles.iosDatePicker : null}
              />
            )}

            <Text style={styles.label}>{t("manage_menu_lunch")}</Text>
            <TextInput
              style={styles.textInput}
              value={lunch}
              onChangeText={setLunch}
              placeholder={t("manage_menu_lunch_ph")}
              placeholderTextColor="#9CA3AF"
              multiline
            />

            <Text style={styles.label}>{t("manage_menu_dinner")}</Text>
            <TextInput
              style={styles.textInput}
              value={dinner}
              onChangeText={setDinner}
              placeholder={t("manage_menu_dinner_ph")}
              placeholderTextColor="#9CA3AF"
              multiline
            />

            {(Array.isArray(pollOptions) ? pollOptions : []).length > 0 ? (
              <>
                <Text style={styles.label}>
                  {language === "en" ? "Menu Category" : "मेनू श्रेणी"}
                </Text>
                <View style={styles.menuCategorySelector}>
                  {pollOptions.map((opt) => {
                    const selected = selectedOptionKey === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.menuCategoryChip,
                          selected && styles.menuCategoryChipSelected,
                        ]}
                        onPress={() => setSelectedOptionKey(opt.key)}
                      >
                        <Text
                          style={[
                            styles.menuCategoryChipText,
                            selected && styles.menuCategoryChipTextSelected,
                          ]}
                        >
                          {formatPollOptionLabel(opt, language)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t("manage_menu_save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const CreateMenuFlowModal = ({
  visible,
  onClose,
  onSave,
  date,
  language,
  t,
}) => {
  const [optionCount, setOptionCount] = useState(1);
  const [step, setStep] = useState(1);
  const [menuDate, setMenuDate] = useState(date ? new Date(date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [singleLunch, setSingleLunch] = useState("");
  const [singleDinner, setSingleDinner] = useState("");
  const [optionOneLabel, setOptionOneLabel] = useState(
    language === "mr" ? "व्हेज" : "Veg"
  );
  const [optionTwoLabel, setOptionTwoLabel] = useState(
    language === "mr" ? "नॉन व्हेज" : "Non Veg"
  );
  const [optionOneLunch, setOptionOneLunch] = useState("");
  const [optionOneDinner, setOptionOneDinner] = useState("");
  const [optionTwoLunch, setOptionTwoLunch] = useState("");
  const [optionTwoDinner, setOptionTwoDinner] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setOptionCount(1);
    setMenuDate(date ? new Date(date) : new Date());
    setShowDatePicker(false);
    setSingleLunch("");
    setSingleDinner("");
    setOptionOneLunch("");
    setOptionOneDinner("");
    setOptionTwoLunch("");
    setOptionTwoDinner("");
  }, [visible, date]);

  // Keep user-chosen `menuDate` stable while they are creating menus.
  // Only update default option labels when language changes.
  useEffect(() => {
    if (!visible) return;
    setOptionOneLabel(language === "mr" ? "व्हेज" : "Veg");
    setOptionTwoLabel(language === "mr" ? "नॉन व्हेज" : "Non Veg");
  }, [visible, language]);

  const maxStep = optionCount === 1 ? 2 : 3;

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) setMenuDate(selectedDate);
  };

  const validateCurrentStep = () => {
    if (step === 1) return true;

    if (optionCount === 1) {
      const lunch = singleLunch.trim();
      const dinner = singleDinner.trim();
      if (!lunch && !dinner) {
        Alert.alert(t("alert_validation_title"), t("manage_menu_validation_lunch_dinner"));
        return false;
      }
      return true;
    }

    if (step === 2) {
      const labelOne = optionOneLabel.trim();
      const labelTwo = optionTwoLabel.trim();
      if (!labelOne || !labelTwo) {
        Alert.alert(
          t("alert_validation_title"),
          language === "en"
            ? "Please enter both option names"
            : "कृपया दोन्ही पर्यायांची नावे भरा"
        );
        return false;
      }
      return true;
    }

    const menuOne = {
      lunch: optionOneLunch.trim(),
      dinner: optionOneDinner.trim(),
    };
    const menuTwo = {
      lunch: optionTwoLunch.trim(),
      dinner: optionTwoDinner.trim(),
    };
    if ((!menuOne.lunch && !menuOne.dinner) || (!menuTwo.lunch && !menuTwo.dinner)) {
      Alert.alert(
        t("alert_validation_title"),
        language === "en"
          ? "Each option needs at least lunch or dinner"
          : "प्रत्येक पर्यायासाठी किमान लंच किंवा डिनर भरा"
      );
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (optionCount === 1) {
      const lunch = singleLunch.trim();
      const dinner = singleDinner.trim();
      if (!lunch && !dinner) {
        Alert.alert(t("alert_validation_title"), t("manage_menu_validation_lunch_dinner"));
        return;
      }
      setSaving(true);
      try {
        await onSave({
          date: menuDate.toISOString(),
          mode: "single",
          menu: { lunch, dinner },
        });
        onClose();
      } catch (err) {
        const msg = err?.response?.data?.message || t("manage_menu_menu_save_failed");
        Alert.alert(t("alert_error"), msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    const labelOne = optionOneLabel.trim();
    const labelTwo = optionTwoLabel.trim();
    const menuOne = {
      lunch: optionOneLunch.trim(),
      dinner: optionOneDinner.trim(),
    };
    const menuTwo = {
      lunch: optionTwoLunch.trim(),
      dinner: optionTwoDinner.trim(),
    };

    if (!labelOne || !labelTwo) {
      Alert.alert(
        t("alert_validation_title"),
        language === "en"
          ? "Please enter both option names"
          : "कृपया दोन्ही पर्यायांची नावे भरा"
      );
      return;
    }

    if ((!menuOne.lunch && !menuOne.dinner) || (!menuTwo.lunch && !menuTwo.dinner)) {
      Alert.alert(
        t("alert_validation_title"),
        language === "en"
          ? "Each option needs at least lunch or dinner"
          : "प्रत्येक पर्यायासाठी किमान लंच किंवा डिनर भरा"
      );
      return;
    }

    setSaving(true);
    try {
      await onSave({
        date: menuDate.toISOString(),
        mode: "double",
        poll: {
          question: language === "mr" ? "जेवणाची पसंती" : "Meal Preference",
          options: [
            { label: labelOne, labelMr: labelOne },
            { label: labelTwo, labelMr: labelTwo },
          ],
        },
        menus: [
          { optionLabel: labelOne, lunch: menuOne.lunch, dinner: menuOne.dinner },
          { optionLabel: labelTwo, lunch: menuTwo.lunch, dinner: menuTwo.dinner },
        ],
      });
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || t("manage_menu_menu_save_failed");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(prev + 1, maxStep));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {language === "en" ? "Create Menu" : "मेनू तयार करा"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{t("manage_menu_date")}</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateText}>{formatDisplayDate(menuDate)}</Text>
              <Ionicons name="calendar-outline" size={20} color="#6B7280" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={menuDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDateChange}
                style={Platform.OS === "ios" ? styles.iosDatePicker : null}
              />
            )}

            <Text style={styles.stepHintText}>
              {language === "en"
                ? `Step ${step} of ${maxStep}`
                : `स्टेप ${step} / ${maxStep}`}
            </Text>

            {step === 1 ? (
              <>
                <Text style={styles.label}>
                  {language === "en" ? "Number of Options" : "पर्यायांची संख्या"}
                </Text>
                <View style={styles.menuCategorySelector}>
                  {[1, 2].map((count) => {
                    const selected = optionCount === count;
                    return (
                      <TouchableOpacity
                        key={count}
                        style={[
                          styles.menuCategoryChip,
                          selected && styles.menuCategoryChipSelected,
                        ]}
                        onPress={() => setOptionCount(count)}
                      >
                        <Text
                          style={[
                            styles.menuCategoryChipText,
                            selected && styles.menuCategoryChipTextSelected,
                          ]}
                        >
                          {String(count)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {optionCount === 1 && step === 2 ? (
              <>
                <Text style={styles.stepTitleText}>
                  {language === "en" ? "Enter Menu" : "मेनू भरा"}
                </Text>
                <Text style={styles.label}>{t("manage_menu_lunch")}</Text>
                <TextInput
                  style={styles.textInput}
                  value={singleLunch}
                  onChangeText={setSingleLunch}
                  placeholder={t("manage_menu_lunch_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
                <Text style={styles.label}>{t("manage_menu_dinner")}</Text>
                <TextInput
                  style={styles.textInput}
                  value={singleDinner}
                  onChangeText={setSingleDinner}
                  placeholder={t("manage_menu_dinner_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </>
            ) : null}

            {optionCount === 2 && step === 2 ? (
              <>
                <Text style={styles.stepTitleText}>
                  {language === "en" ? "Enter Option Names" : "पर्यायांची नावे भरा"}
                </Text>
                <Text style={styles.label}>
                  {language === "en" ? "Option 1 Name" : "पर्याय 1 नाव"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionOneLabel}
                  onChangeText={setOptionOneLabel}
                  placeholder={language === "en" ? "Veg" : "व्हेज"}
                  placeholderTextColor="#9CA3AF"
                />

                <Text style={styles.label}>
                  {language === "en" ? "Option 2 Name" : "पर्याय 2 नाव"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionTwoLabel}
                  onChangeText={setOptionTwoLabel}
                  placeholder={language === "en" ? "Non Veg" : "नॉन व्हेज"}
                  placeholderTextColor="#9CA3AF"
                />
              </>
            ) : null}

            {optionCount === 2 && step === 3 ? (
              <>
                <Text style={styles.stepTitleText}>
                  {language === "en"
                    ? "Enter Meals For Each Option"
                    : "प्रत्येक पर्यायासाठी मेनू भरा"}
                </Text>
                <Text style={styles.optionSectionTitle}>
                  {optionOneLabel.trim() || (language === "en" ? "Option 1" : "पर्याय 1")}
                </Text>
                <Text style={styles.label}>
                  {language === "en" ? "Option 1 Lunch" : "पर्याय 1 लंच"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionOneLunch}
                  onChangeText={setOptionOneLunch}
                  placeholder={t("manage_menu_lunch_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
                <Text style={styles.label}>
                  {language === "en" ? "Option 1 Dinner" : "पर्याय 1 डिनर"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionOneDinner}
                  onChangeText={setOptionOneDinner}
                  placeholder={t("manage_menu_dinner_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />

                <Text style={styles.optionSectionTitle}>
                  {optionTwoLabel.trim() || (language === "en" ? "Option 2" : "पर्याय 2")}
                </Text>
                <Text style={styles.label}>
                  {language === "en" ? "Option 2 Lunch" : "पर्याय 2 लंच"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionTwoLunch}
                  onChangeText={setOptionTwoLunch}
                  placeholder={t("manage_menu_lunch_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
                <Text style={styles.label}>
                  {language === "en" ? "Option 2 Dinner" : "पर्याय 2 डिनर"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={optionTwoDinner}
                  onChangeText={setOptionTwoDinner}
                  placeholder={t("manage_menu_dinner_ph")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </>
            ) : null}
          </ScrollView>

          <View style={styles.modalActionsRow}>
            {step > 1 ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleBack}
                disabled={saving}
              >
                <Text style={styles.secondaryButtonText}>
                  {language === "en" ? "Back" : "मागे"}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={step === maxStep ? handleSave : handleNext}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {step === maxStep
                    ? t("manage_menu_save")
                    : language === "en"
                      ? "Next"
                      : "पुढे"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const PollResultsBlock = ({ poll, language, t }) => (
  <>
    <Text style={[styles.cardValue, { marginTop: 10, fontWeight: "700" }]}>
      {formatPollQuestion(poll, language) || getDefaultPollTemplate(language).question}
    </Text>
    <View style={{ marginTop: 12 }}>
      {(poll.options || []).map((o) => (
        <View key={o.key} style={styles.menuRow}>
          <Text style={styles.menuLabel}>{formatPollOptionLabel(o, language)}: </Text>
          <Text style={styles.menuValue}>{Number(poll.counts?.[o.key] || 0)}</Text>
        </View>
      ))}
      <Text style={[styles.cardLabel, { marginTop: 10 }]}>
        {t("manage_menu_poll_total_votes")} {Number(poll.totalVotes || 0)}
      </Text>
    </View>
  </>
);

const menuCategoryLabel = (item, language) => {
  const en = String(item?.pollOptionLabel || "").trim();
  const mr = String(item?.pollOptionLabelMr || "").trim();
  const fallback = String(item?.pollOptionKey || "").trim();
  if (language === "mr") return mr || en || fallback || "";
  return en || mr || fallback || "";
};

const MenuCard = ({ item, onEdit, onDelete, language, t, readOnly }) => (
  <View style={readOnly ? styles.menuCardPast : styles.card}>
    <Text style={readOnly ? styles.menuCardPastDate : styles.cardDate}>
      {formatDisplayDate(item.date)}
    </Text>
    {menuCategoryLabel(item, language) ? (
      <Text style={styles.menuCategoryBadge}>{menuCategoryLabel(item, language)}</Text>
    ) : null}
    <View style={readOnly ? styles.menuCardPastSection : styles.cardSection}>
      <Text style={readOnly ? styles.menuCardPastLabel : styles.cardLabel}>
        {t("manage_menu_lunch")}
      </Text>
      <Text style={readOnly ? styles.menuCardPastValue : styles.cardValue}>
        {menuLine(item, language, "lunch") || "-"}
      </Text>
    </View>
    <View style={readOnly ? styles.menuCardPastSection : styles.cardSection}>
      <Text style={readOnly ? styles.menuCardPastLabel : styles.cardLabel}>
        {t("manage_menu_dinner")}
      </Text>
      <Text style={readOnly ? styles.menuCardPastValue : styles.cardValue}>
        {menuLine(item, language, "dinner") || "-"}
      </Text>
    </View>
    {!readOnly ? (
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => onEdit(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil" size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>{t("manage_members_edit")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash" size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>{t("manage_members_delete")}</Text>
        </TouchableOpacity>
      </View>
    ) : null}
  </View>
);

const PollFormModal = ({
  onClose,
  onSave,
  initialData,
  pollDate,
  language,
  t,
}) => {
  const defaults = getDefaultPollTemplate(language);
  const [question, setQuestion] = useState(
    language === "mr"
      ? initialData?.questionMr || initialData?.question || defaults.question
      : initialData?.question || initialData?.questionMr || defaults.question
  );
  const mapOptionsFromInitial = (data) => {
    const d = getDefaultPollTemplate(language);
    const src =
      Array.isArray(data?.options) && data.options.length >= 2 ? data.options : d.options;
    return src.map((o) => ({
      key: String(o?.key || "").trim() || newPollOptionKey(),
      label: String(o?.label || "").trim(),
      labelMr: String(o?.labelMr || "").trim() || String(o?.label || "").trim(),
    }));
  };
  const [options, setOptions] = useState(() =>
    mapOptionsFromInitial(initialData)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = getDefaultPollTemplate(language);
    const q =
      language === "mr"
        ? initialData?.questionMr || initialData?.question || d.question
        : initialData?.question || initialData?.questionMr || d.question;
    setQuestion(q);
  }, [language, initialData]);

  // Options are initialized via `useState(() => mapOptionsFromInitial(initialData))`.
  // Avoid re-initializing while the admin is typing (it causes inputs to "snap back").

  // NOTE: Keep option keys stable while typing. Never generate random keys during render.
  const normalizeOptionForState = (o) => {
    if (o && typeof o === "object") {
      return {
        key: String(o.key || "").trim() || newPollOptionKey(),
        label: String(o.label || ""),
        labelMr: String(o.labelMr || ""),
      };
    }
    return { key: newPollOptionKey(), label: "", labelMr: "" };
  };

  const normalizeOptionForRender = (o, idx) => {
    if (o && typeof o === "object") {
      const key = String(o.key || "").trim() || `idx-${idx}`;
      return { key, label: String(o.label || ""), labelMr: String(o.labelMr || "") };
    }
    return { key: `idx-${idx}`, label: "", labelMr: "" };
  };

  const updateOption = (idx, patch) => {
    setOptions((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (idx < 0 || idx >= arr.length) return arr;
      return arr.map((o, i) =>
        i === idx
          ? { ...normalizeOptionForState(o), ...patch }
          : normalizeOptionForState(o)
      );
    });
  };

  const removeOption = (idx) => {
    setOptions((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      if (idx < 0 || idx >= arr.length) return arr;
      return arr.filter((_, i) => i !== idx).map(normalizeOptionForState);
    });
  };

  const addOption = () => {
    setOptions((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      return [
        ...arr.map(normalizeOptionForState),
        { key: newPollOptionKey(), label: "", labelMr: "" },
      ];
    });
  };

  const handleSave = async () => {
    const d = getDefaultPollTemplate(language);
    const q = String(question || "").trim() || d.question;
    const normalized = (Array.isArray(options) ? options : [])
      .map((o) => {
        const label = String(o?.label || "").trim();
        const labelMr = String(o?.labelMr || "").trim();
        let key = String(o?.key || "").trim().toLowerCase();
        key = key.replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
        if (!key) key = newPollOptionKey();
        return { key, label, labelMr };
      })
      .filter((o) => o.label || o.labelMr);

    const unique = [];
    const used = new Set();
    for (const o of normalized) {
      let k = o.key;
      let n = 0;
      while (used.has(k)) {
        n += 1;
        k = `${o.key}_${n}`;
      }
      used.add(k);
      unique.push({ key: k, label: o.label, labelMr: o.labelMr });
    }

    if (unique.length < 2) {
      Alert.alert(t("alert_validation_title"), t("manage_menu_poll_validation_options"));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        // Send a stable YYYY-MM-DD so backend buckets the intended day.
        date: localDateKey(pollDate || new Date()),
        question: q,
        options: unique,
      });
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || t("manage_menu_poll_save_failed");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {initialData?._id
                ? t("manage_menu_poll_modal_edit")
                : t("manage_menu_poll_modal_create")}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#4B5563" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{t("manage_menu_date")}</Text>
            <View style={styles.dateInput}>
              <Text style={styles.dateText}>
                {formatDisplayDate(pollDate || new Date())}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#6B7280" />
            </View>

            <Text style={styles.label}>{t("manage_menu_poll_question")}</Text>
            <TextInput
              style={styles.textInput}
              value={question}
              onChangeText={setQuestion}
              placeholder={t("manage_menu_poll_question_ph")}
              placeholderTextColor="#9CA3AF"
            />

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.label}>{t("manage_menu_poll_options")}</Text>
              <TouchableOpacity onPress={addOption} style={{ paddingVertical: 6 }}>
                <Text style={{ fontWeight: "700", color: "#111827" }}>
                  {t("manage_menu_poll_add_option")}
                </Text>
              </TouchableOpacity>
            </View>

            {(Array.isArray(options) ? options : []).map((rawOpt, idx) => {
              const opt = normalizeOptionForRender(rawOpt, idx);
              const disableRemove = (Array.isArray(options) ? options : []).length <= 2;
              return (
                <View key={opt.key || `idx-${idx}`} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                      value={
                        language === "mr"
                          ? String(opt.labelMr || opt.label || "")
                          : String(opt.label || opt.labelMr || "")
                      }
                      onChangeText={(v) =>
                        updateOption(idx, language === "mr" ? { labelMr: v } : { label: v })
                      }
                      placeholder={t("manage_menu_poll_option_text_ph")}
                      placeholderTextColor="#9CA3AF"
                    />
                    <TouchableOpacity
                      onPress={() => removeOption(idx)}
                      disabled={disableRemove}
                      style={{
                        paddingHorizontal: 8,
                        justifyContent: "center",
                        opacity: disableRemove ? 0.4 : 1,
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t("manage_menu_save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const ManageMenu = () => {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [createFlowVisible, setCreateFlowVisible] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [prefillNewMenu, setPrefillNewMenu] = useState(null);
  const [pollsList, setPollsList] = useState([]);
  const [pollLoading, setPollLoading] = useState(false);
  const [pollError, setPollError] = useState("");
  const [pollFormVisible, setPollFormVisible] = useState(false);
  const [pollFormInstanceKey, setPollFormInstanceKey] = useState(0);
  const [editingPoll, setEditingPoll] = useState(null);
  const [menuFormPollOptions, setMenuFormPollOptions] = useState([]);
  /** Lower bound from API (authoritative); avoids missing `createdAt` in AsyncStorage. */
  const [accountCreatedDay, setAccountCreatedDay] = useState(null);

  const fetchMenus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_BASE_URL}/api/menu`);
      setMenus(data);
    } catch (err) {
      const msg = err.response?.data?.message || t("manage_menu_load_failed");
      Alert.alert(t("alert_error"), msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/auth/admin-account-bounds");
        const raw = data?.createdAt;
        if (cancelled || !raw) return;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return;
        setAccountCreatedDay(
          new Date(d.getFullYear(), d.getMonth(), d.getDate())
        );
      } catch {
        // Rely on user.createdAt from login payload if the call fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filterDateMinFromStoredUser = useMemo(() => {
    const raw = user?.createdAt;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [user?.createdAt]);

  /** Server response overrides stored login payload (authoritative creation instant). */
  const filterDateMin = useMemo(
    () => accountCreatedDay ?? filterDateMinFromStoredUser,
    [accountCreatedDay, filterDateMinFromStoredUser]
  );

  const n = new Date();
  const filterDateMax = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const filterMaxTs = filterDateMax.getTime();
  const filterMinTs = filterDateMin?.getTime() ?? null;
  const filterPickerMin = useMemo(() => {
    if (filterMinTs == null) return undefined;
    const capped = filterMinTs > filterMaxTs ? filterMaxTs : filterMinTs;
    return new Date(capped);
  }, [filterMinTs, filterMaxTs]);

  // Local midnight for selected calendar day (filter or today).
  const pollDate = useMemo(() => {
    if (filterDate) {
      const d = new Date(filterDate);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, [filterDate]);
  const pollDateKey = useMemo(() => localDateKey(pollDate), [pollDate]);

  const fetchPollsList = useCallback(async () => {
    try {
      setPollLoading(true);
      setPollError("");
      const res = await api.get("/api/polls/list");
      setPollsList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg = err.response?.data?.message || t("manage_menu_poll_load_failed");
      setPollError(msg);
      setPollsList([]);
    } finally {
      setPollLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchPollsList();
  }, [fetchPollsList]);

  const poll = useMemo(
    () => pollsList.find((p) => pollDateKeyFromPollDoc(p) === pollDateKey) || null,
    [pollsList, pollDateKey]
  );

  const pollHistory = useMemo(() => {
    const now = Date.now();
    return pollsList
      .filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() <= now)
      .filter((p) => pollDateKeyFromPollDoc(p) !== pollDateKey)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [pollsList, pollDateKey]);

  const todayLocalKey = localDateKey(new Date());
  const isSelectedPollDayPast = localDateKey(pollDate) < todayLocalKey;
  const isCurrentPollExpired =
    !!(poll?.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now());
  const pollActionsLocked = isSelectedPollDayPast || isCurrentPollExpired;

  const getPollOptionsForDate = useCallback(
    (dateLike) => {
      const key = localDateKey(dateLike || new Date());
      const dayPoll = pollsList.find((p) => pollDateKeyFromPollDoc(p) === key);
      return Array.isArray(dayPoll?.options) ? dayPoll.options : [];
    },
    [pollsList]
  );

  const sortedMenus = useMemo(
    () => [...menus].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [menus]
  );

  const filteredMenus = useMemo(() => {
    if (filterDate) {
      const fk = localDateKey(filterDate);
      return sortedMenus.filter((m) => localDateKey(m.date) === fk);
    }
    return sortedMenus;
  }, [sortedMenus, filterDate]);

  /** With no filter: today and future only; past days are viewed via date filter. */
  const activeMenus = useMemo(() => {
    if (filterDate) return filteredMenus;
    const tl = localDateKey(new Date());
    return sortedMenus.filter((m) => localDateKey(m.date) >= tl);
  }, [filterDate, filteredMenus, sortedMenus]);

  const isMenuReadOnly = useCallback(
    (item) => {
      const tl = localDateKey(new Date());
      if (filterDate) return localDateKey(filterDate) < tl;
      return localDateKey(item.date) < tl;
    },
    [filterDate]
  );

  const targetMenuDate = useMemo(() => filterDate || new Date(), [filterDate]);

  const handleAddMenu = () => {
    setCreateFlowVisible(true);
  };

  const handleEditMenu = (item) => {
    setEditingMenu(item);
    setMenuFormPollOptions(getPollOptionsForDate(item?.date || new Date()));
    setPrefillNewMenu(null);
    setFormVisible(true);
  };

  const handleDeleteMenu = (item) => {
    Alert.alert(
      t("manage_menu_delete_menu_title"),
      t("manage_menu_delete_menu_body").replace(
        /\{\{date\}\}/g,
        formatDisplayDate(item.date)
      ),
      [
        { text: t("button_cancel"), style: "cancel" },
        {
          text: t("manage_members_delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await axios.delete(`${API_BASE_URL}/api/menu/${item._id}`);
              fetchMenus();
            } catch (err) {
              const msg =
                err.response?.data?.message || t("manage_menu_menu_delete_failed");
              Alert.alert(t("alert_error"), msg);
            }
          },
        },
      ]
    );
  };

  const handleSaveMenu = async (payload) => {
    if (editingMenu) {
      await axios.put(`${API_BASE_URL}/api/menu/${editingMenu._id}`, payload);
    } else {
      await axios.post(`${API_BASE_URL}/api/menu`, payload);
    }
    fetchMenus();
  };

  const handleCreateMenuFlow = async (payload) => {
    const selectedDateKey = localDateKey(payload?.date || targetMenuDate);
    const existingMenusForDay = menus.filter(
      (m) => localDateKey(m.date) === selectedDateKey
    );
    const existingPollForDay = pollsList.find(
      (p) => pollDateKeyFromPollDoc(p) === selectedDateKey
    );

    if (payload?.mode === "single") {
      if (existingMenusForDay.length > 0 || existingPollForDay) {
        throw new Error(
          language === "en"
            ? "Poll or menu already exists for this date"
            : "या तारखेसाठी पोल किंवा मेनू आधीच उपलब्ध आहे"
        );
      }
      await axios.post(`${API_BASE_URL}/api/menu`, {
        date: payload.date,
        lunch: payload?.menu?.lunch || "",
        dinner: payload?.menu?.dinner || "",
      });
      await fetchMenus();
      return;
    }

    if (existingPollForDay || existingMenusForDay.length > 0) {
      throw new Error(
        language === "en"
          ? "Poll or menus already exist for this date"
          : "या तारखेसाठी पोल किंवा मेनू आधीच उपलब्ध आहेत"
      );
    }

    const options = (payload?.poll?.options || []).map((option, index) => ({
      key: `option${index + 1}`,
      label: option.label,
      labelMr: option.labelMr,
    }));

    await api.post("/api/polls", {
      date: payload.date,
      question: payload?.poll?.question,
      options,
    });

    await Promise.all(
      (payload?.menus || []).map((menu, index) =>
        axios.post(`${API_BASE_URL}/api/menu`, {
          date: payload.date,
          lunch: menu.lunch,
          dinner: menu.dinner,
          pollOptionKey: options[index]?.key || "",
          pollOptionLabel: options[index]?.label || "",
          pollOptionLabelMr: options[index]?.labelMr || options[index]?.label || "",
        })
      )
    );

    await Promise.all([fetchMenus(), fetchPollsList()]);
  };

  const handleFilterDateChange = (event, selectedDate) => {
    setShowFilterPicker(Platform.OS === "ios");
    if (!selectedDate) return;
    let ts = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    ).getTime();
    if (filterMinTs != null && ts < filterMinTs) ts = filterMinTs > filterMaxTs ? filterMaxTs : filterMinTs;
    if (ts > filterMaxTs) ts = filterMaxTs;
    setFilterDate(new Date(ts));
  };

  useEffect(() => {
    if (!filterDate) return;
    const ts = new Date(
      filterDate.getFullYear(),
      filterDate.getMonth(),
      filterDate.getDate()
    ).getTime();
    if (filterMinTs != null && ts < filterMinTs) {
      setFilterDate(null);
      return;
    }
    if (ts > filterMaxTs) setFilterDate(null);
  }, [filterDate, filterMinTs, filterMaxTs]);

  const openCreatePoll = () => {
    setEditingPoll(null);
    setPollFormInstanceKey((k) => k + 1);
    setPollFormVisible(true);
  };

  const openEditPoll = () => {
    setEditingPoll(poll);
    setPollFormInstanceKey((k) => k + 1);
    setPollFormVisible(true);
  };

  const handleSavePoll = async (payload) => {
    if (editingPoll?._id) {
      await api.put(`/api/polls/${editingPoll._id}`, payload);
    } else {
      await api.post("/api/polls", payload);
    }
    await fetchPollsList();
  };

  const handleDeletePoll = () => {
    if (!poll?._id) return;
    Alert.alert(t("manage_menu_poll_delete_title"), t("manage_menu_poll_delete_body"), [
      { text: t("button_cancel"), style: "cancel" },
      {
        text: t("manage_members_delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/api/polls/${poll._id}`);
            await fetchPollsList();
          } catch (err) {
            const msg =
              err.response?.data?.message || t("manage_menu_poll_delete_failed");
            Alert.alert(t("alert_error"), msg);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("card_menu")}</Text>
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={styles.dateFilterButton}
            onPress={() => setShowFilterPicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#111827" />
            <Text style={styles.dateFilterText}>
              {filterDate
                ? formatDisplayDate(filterDate)
                : language === "en"
                ? "Filter by date"
                : "तारखेनुसार फिल्टर"}
            </Text>
          </TouchableOpacity>
          {filterDate && (
            <TouchableOpacity
              style={styles.clearFilterButton}
              onPress={() => setFilterDate(null)}
            >
              <Text style={styles.clearFilterText}>
                {language === "en" ? "Clear" : "रीसेट"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {showFilterPicker && (
          <DateTimePicker
            value={filterDate || filterDateMax}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={filterPickerMin}
            maximumDate={filterDateMax}
            onChange={handleFilterDateChange}
          />
        )}

        <View style={[styles.card, { marginBottom: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.cardDate, { marginBottom: 0 }]}>
              {t("manage_menu_poll_section")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              {poll?._id ? (
                pollActionsLocked ? (
                  <Text style={styles.readOnlyHint}>
                    {language === "en" ? "View only" : "फक्त वाचन"}
                  </Text>
                ) : (
                  <>
                    <TouchableOpacity onPress={openEditPoll} style={{ paddingVertical: 6 }}>
                      <Text style={{ fontWeight: "700", color: "#111827" }}>
                        {t("manage_members_edit")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDeletePoll} style={{ paddingVertical: 6 }}>
                      <Text style={{ fontWeight: "700", color: "#DC2626" }}>
                        {t("manage_members_delete")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )
              ) : null}
            </View>
          </View>

          <Text style={[styles.cardLabel, { marginTop: 10 }]}>
            {formatDisplayDate(pollDate)}
          </Text>

          {pollLoading ? (
            <View style={[styles.billLoadingRow, { marginTop: 10 }]}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={styles.billLoadingText}>{t("manage_menu_poll_loading")}</Text>
            </View>
          ) : pollError ? (
            <Text style={[styles.billErrorText, { marginTop: 10 }]}>{pollError}</Text>
          ) : !poll ? (
            <>
              <Text style={[styles.cardValue, { marginTop: 10 }]}>
                {t("manage_menu_poll_none")}
              </Text>
            </>
          ) : (
            <PollResultsBlock poll={poll} language={language} t={t} />
          )}
        </View>

        {pollHistory.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>{t("manage_menu_poll_history")}</Text>
            {pollHistory.map((hp) => (
              <View key={hp._id} style={[styles.card, styles.cardHistory, { marginBottom: 16 }]}>
                <Text style={styles.cardDate}>{formatDisplayDate(hp.date)}</Text>
                <PollResultsBlock poll={hp} language={language} t={t} />
              </View>
            ))}
          </>
        ) : null}

        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddMenu}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addButtonText}>{t("manage_menu_add_menu")}</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : filterDate && filteredMenus.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color="#9CA3AF" />
            <View style={{ width: "100%", marginTop: 12 }}>
              <Text style={styles.emptyText}>
                {language === "en"
                  ? "No menu added for this date. Default menu:"
                  : "या तारखेसाठी मेनू उपलब्ध नाही. डीफॉल्ट मेनू:"}
              </Text>
              <View style={[styles.card, { marginTop: 16 }]}>
                <Text style={styles.cardDate}>{formatDisplayDate(filterDate)}</Text>
                <View style={styles.cardSection}>
                  <Text style={styles.cardLabel}>{t("manage_menu_lunch")}</Text>
                  <Text style={styles.cardValue}>
                    {menuLine(getDefaultMessMenuForDate(filterDate), language, "lunch")}
                  </Text>
                </View>
                <View style={styles.cardSection}>
                  <Text style={styles.cardLabel}>{t("manage_menu_dinner")}</Text>
                  <Text style={styles.cardValue}>
                    {menuLine(getDefaultMessMenuForDate(filterDate), language, "dinner")}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : !filterDate && activeMenus.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>
              {sortedMenus.length > 0
                ? language === "en"
                  ? "No menu for today or upcoming dates. Use filter to view past menus."
                  : "आज किंवा पुढील तारखांसाठी मेनू नाही. मागील मेनू पाहण्यासाठी फिल्टर वापरा."
                : language === "en"
                ? "No menus yet. Add one!"
                : "अजून कोणताही मेनू नाही. नवीन मेनू जोडा!"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={activeMenus}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <MenuCard
                item={item}
                language={language}
                t={t}
                readOnly={isMenuReadOnly(item)}
                onEdit={handleEditMenu}
                onDelete={handleDeleteMenu}
              />
            )}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </ScrollView>

      <MenuFormModal
        visible={formVisible}
        language={language}
        t={t}
        pollOptions={menuFormPollOptions}
        onClose={() => {
          setFormVisible(false);
          setEditingMenu(null);
          setPrefillNewMenu(null);
          setMenuFormPollOptions([]);
        }}
        onSave={handleSaveMenu}
        initialData={editingMenu || prefillNewMenu}
        isEditing={!!editingMenu}
      />

      <CreateMenuFlowModal
        visible={createFlowVisible}
        date={targetMenuDate}
        language={language}
        t={t}
        onClose={() => setCreateFlowVisible(false)}
        onSave={async (flowPayload) => {
          try {
            await handleCreateMenuFlow(flowPayload);
            setCreateFlowVisible(false);
          } catch (err) {
            const msg =
              err?.response?.data?.message ||
              err?.message ||
              t("manage_menu_menu_save_failed");
            throw { response: { data: { message: msg } } };
          }
        }}
      />

      {pollFormVisible ? (
        <PollFormModal
          key={pollFormInstanceKey}
          pollDate={pollDate}
          language={language}
          t={t}
          onClose={() => {
            setPollFormVisible(false);
            setEditingPoll(null);
          }}
          onSave={handleSavePoll}
          initialData={editingPoll}
        />
      ) : null}
    </View>
  );
};

export default ManageMenu;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  mainScroll: {
    flex: 1,
  },
  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  dateFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  clearFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  clearFilterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000000",
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: "#6B7280",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHistory: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  menuCardPast: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  menuCardPastDate: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 6,
  },
  menuCardPastSection: {
    marginBottom: 4,
  },
  menuCardPastLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 2,
  },
  menuCardPastValue: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 8,
  },
  readOnlyHint: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  cardDate: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  cardSection: {
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: "row",
    marginTop: 16,
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#DC2626",
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  separator: {
    height: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  formScroll: {
    maxHeight: 400,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  dateText: {
    fontSize: 15,
    color: "#111827",
  },
  iosDatePicker: {
    height: 120,
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 15,
    color: "#111827",
    marginBottom: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },
  modalActions: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  modalActionsRow: {
    paddingHorizontal: 24,
    paddingTop: 20,
    flexDirection: "row",
    gap: 10,
  },
  saveButton: {
    backgroundColor: "#000000",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  billLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  billLoadingText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  billErrorText: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "600",
  },
  menuRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  menuValue: {
    fontSize: 14,
    color: "#111827",
    flexShrink: 1,
  },
  stepHintText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
  },
  stepTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  optionSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  menuCategorySelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  menuCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  menuCategoryChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  menuCategoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  menuCategoryChipTextSelected: {
    color: "#FFFFFF",
  },
  menuCategoryBadge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    backgroundColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
});

