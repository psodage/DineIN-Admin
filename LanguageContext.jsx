import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const translations = {
  en: {
    alert_success: "Success",
    alert_error: "Error",

    login_title: "Sign In",
    login_missing_fields: "Please enter email and password",
    login_success: "Login Successful",
    login_failed_generic: "Login failed. Please check your email and password.",
    member_login_missing_fields: "Please enter email and password",
    member_login_failed_generic:
      "Login failed. Please check your email and password.",

    email_label: "Email Address",
    email_placeholder: "Email",
    phone_label: "Phone Number",
    phone_placeholder: "Phone",
    password_label: "Password",
    password_placeholder: "Password",

    forgot_title: "Forgot Password",
    forgot_subtitle:
      "Enter your admin email address and we will send you a 6-digit OTP to reset your password.",
    forgot_missing_email: "Please enter your email address",
    forgot_user_not_found: "No admin account found with this email.",
    member_forgot_user_not_found: "No member account found with this email.",
    forgot_success:
      "If this email is registered, an OTP has been sent.",
    forgot_failed_generic: "Failed to send OTP email",
    forgot_button: "Send OTP",
    otp_rate_limit: "Too many OTP requests. Please try again later.",

    reset_title: "Reset Password",
    reset_subtitle_prefix: "Enter the OTP sent to",
    reset_subtitle_suffix:
      "and your new password to reset your admin account.",
    reset_email_missing:
      "Email is missing. Please initiate password reset again.",
    reset_otp_missing: "Please enter the OTP sent to your email.",
    reset_passwords_missing: "Please fill in both password fields",
    reset_passwords_mismatch: "Passwords do not match",
    reset_success: "Password reset successful",
    reset_failed_generic: "Failed to reset password",

    otp_label: "OTP",
    otp_placeholder: "Enter 6-digit OTP",
    verify_otp_button: "Verify OTP",
    otp_verify_success: "OTP verified. You can now set your new password.",
    new_password_label: "New Password",
    new_password_placeholder: "New Password",
    confirm_new_password_label: "Confirm New Password",
    confirm_new_password_placeholder: "Confirm New Password",

    dashboard_title: "Admin Dashboard",
    dashboard_welcome: "Welcome,",
    logout: "Log Out",
    card_students: "Manage Members",
    card_menu: "Manage Menu",
    card_expenses: "Mess Expenses",
    card_snacks: "Extra Snacks",
    card_snack_products: "Manage Extra Snacks",
    card_payments: "Payments",
    card_reports: "Reports",
    card_leave: "Leave Approvals",

    footer_forgot_prefix: "Forget Password ?",
    footer_forgot_link: "Reset Password",

    manage_members_meal_plan_label: "Meal Plan:",
    manage_members_due_payment_label: "Due Payment:",
    manage_members_call: "Call",
    manage_members_edit: "Edit",
    manage_members_delete: "Delete",
    manage_members_na: "N/A",

    manage_members_member_name_label: "Member name (English or Marathi) *",
    manage_members_room_owner_label: "Room owner (English or Marathi) *",
    manage_members_member_name_placeholder: "e.g. John Doe or राजेश पाटील",
    manage_members_room_owner_placeholder: "e.g. John Doe or मालकाचे नाव",
    manage_members_member_other_script: "Member — other script (optional)",
    manage_members_room_other_script: "Room owner — other script (optional)",
    manage_members_other_script_hint:
      "If the field above is English: enter Marathi here. If it is Marathi: enter English here, or leave empty to auto-translate.",
    manage_members_validation_required:
      "Member name, room owner, and phone are required.",
    manage_members_validation_password_required:
      "Please enter password.",
    manage_members_validation_name_min: "Member name should be at least 2 characters.",
    manage_members_validation_name_chars:
      "Member name may use letters (English or Marathi), spaces, or '.'.",
    manage_members_validation_room_chars:
      "Room owner name may use letters (English or Marathi), spaces, or '.'.",
    manage_members_validation_phone:
      "Phone number should contain 7 to 15 digits.",
    manage_members_validation_email: "Please enter a valid email address.",
    manage_members_validation_joining_format:
      "Joining Date must be in YYYY-MM-DD format.",
    manage_members_validation_joining_invalid: "Joining Date is not a valid date.",
    manage_members_validation_status:
      "Status must be either Active or Inactive.",
    manage_members_validation_meal_plan:
      "Meal Plan must be Lunch, Dinner or Both.",

    alert_validation_title: "Validation",
    button_cancel: "Cancel",

    manage_members_alert_load_failed: "Failed to load students",
    manage_members_alert_member_updated: "Member updated successfully",
    manage_members_alert_member_added: "Member added successfully",
    manage_members_alert_member_deleted: "Member deleted successfully",
    manage_members_alert_delete_title: "Delete Member",
    manage_members_alert_delete_body:
      "Are you sure you want to delete {{name}}?",
    manage_members_alert_delete_failed: "Failed to delete student",
    manage_members_alert_generic_error: "Something went wrong",
    manage_members_alert_phone_unavailable: "Phone number not available",
    manage_members_alert_dialer_error: "Unable to open dialer",

    manage_menu_poll_section: "Poll",
    manage_menu_button_create: "Create",
    manage_menu_poll_create_cta: "Create Poll",
    manage_menu_poll_modal_edit: "Edit Poll",
    manage_menu_poll_modal_create: "Create Poll",
    manage_menu_date: "Date",
    manage_menu_poll_question: "Question (English or Marathi)",
    manage_menu_poll_question_ph:
      "e.g. Veg or Non-Veg? or शाकाहारी किंवा मांसाहारी?",
    manage_menu_poll_options: "Options",
    manage_menu_poll_add_option: "+ Add option",
    manage_menu_poll_option_text_ph:
      "e.g. Veg, Non Veg, or शाकाहारी / मांसाहारी",
    manage_menu_save: "Save",
    manage_menu_poll_loading: "Loading poll…",
    manage_menu_poll_load_failed: "Failed to load poll.",
    manage_menu_poll_none: "No poll for this date.",
    manage_menu_poll_total_votes: "Total votes:",
    manage_menu_poll_validation_options:
      "Please add at least 2 poll options (English or Marathi text).",
    manage_menu_poll_save_failed: "Failed to save poll.",
    manage_menu_poll_delete_title: "Delete poll",
    manage_menu_poll_delete_body: "Are you sure you want to delete this poll?",
    manage_menu_poll_delete_failed: "Failed to delete poll.",
    manage_menu_load_failed: "Failed to load menus.",
    manage_menu_delete_menu_title: "Delete menu",
    manage_menu_delete_menu_body: "Delete the menu for {{date}}?",
    manage_menu_menu_delete_failed: "Failed to delete menu.",
    manage_menu_validation_lunch_dinner: "Please fill lunch or dinner field.",
    manage_menu_menu_save_failed: "Failed to save menu.",
    manage_menu_edit_menu: "Edit Menu",
    manage_menu_add_menu: "Add Menu",
    manage_menu_lunch: "Lunch",
    manage_menu_dinner: "Dinner",
    manage_menu_lunch_ph: "e.g. Rice, Dal, Vegetable, Roti",
    manage_menu_dinner_ph: "e.g. Chapati, Dal, Curry",
    manage_menu_history: "Past menus",
    manage_menu_poll_history: "Past polls",

    member_menu_default_notice:
      "Default menu is shown until the admin sets today’s menu.",

    qr_scanner_title: "Scan Snack Purchase",
    qr_scanner_requesting_camera: "Requesting camera permission…",
    qr_scanner_camera_denied_title: "Camera Access Needed",
    qr_scanner_camera_denied_body:
      "Camera permission is required to scan snack purchase QR codes.",
    qr_scanner_go_back: "Go Back",
    qr_scanner_helper:
      "Ask the member to show their snack purchase QR code and align it within the square.",
    qr_scanner_validating: "Validating order…",
    qr_scanner_valid_title: "Valid Snack Order",
    qr_scanner_mismatch_title: "Order Mismatch",
    qr_scanner_label_member: "Member",
    qr_scanner_label_snack: "Snack",
    qr_scanner_label_quantity: "Quantity",
    qr_scanner_label_total: "Total Amount",
    qr_scanner_label_order_date: "Order Date",
    qr_scanner_label_reference: "Reference ID",
    qr_scanner_scan_again: "Scan Again",
    qr_scanner_ready: "Ready to Scan",
    qr_scanner_na: "N/A",
    qr_scanner_from_qr: "QR",
    qr_scanner_err_invalid_json:
      "Invalid QR code. Please scan a valid snack purchase QR.",
    qr_scanner_err_missing_order: "QR code is missing order information.",
    qr_scanner_err_bulk_ids: "Bulk QR is missing order IDs.",
    qr_scanner_err_permission: "Camera permission is required to scan QR codes.",
    qr_scanner_alert_validation_failed: "Validation Failed",
    qr_scanner_err_validate_failed: "Failed to validate snack order",

    extra_snacks_alert_fetch_orders_failed: "Failed to fetch snack orders",
    extra_snacks_alert_fetch_products_failed: "Failed to load snack items",
    extra_snacks_alert_fetch_members_failed: "Failed to load members",
    extra_snacks_alert_order_updated: "Snack order updated successfully",
    extra_snacks_alert_order_added: "Snack order added successfully",
    extra_snacks_alert_save_failed: "Failed to save snack order",
    extra_snacks_alert_delete_title: "Delete Snack Order",
    extra_snacks_alert_delete_body:
      "Are you sure you want to delete this order for {{name}}?",
    extra_snacks_alert_order_deleted: "Snack order deleted successfully",
    extra_snacks_alert_delete_failed: "Failed to delete snack order",
  },
  mr: {
    alert_success: "यशस्वी",
    alert_error: "त्रुटी",

    login_title: "साइन इन",
    login_missing_fields: "कृपया ईमेल आणि पासवर्ड भरा",
    login_success: "लॉगिन यशस्वी",
    login_failed_generic:
      "लॉगिन अयशस्वी. कृपया ईमेल आणि पासवर्ड तपासा.",
    member_login_missing_fields: "कृपया ईमेल आणि पासवर्ड भरा",
    member_login_failed_generic:
      "लॉगिन अयशस्वी. कृपया ईमेल आणि पासवर्ड तपासा.",

    email_label: "ईमेल पत्ता",
    email_placeholder: "ईमेल",
    phone_label: "फोन नंबर",
    phone_placeholder: "फोन",
    password_label: "पासवर्ड",
    password_placeholder: "पासवर्ड",

    forgot_title: "पासवर्ड विसरलात?",
    forgot_subtitle:
      "तुमचा ॲडमिन ईमेल पत्ता टाका, आम्ही 6-अंकी OTP पाठवू जेणेकरून पासवर्ड रीसेट करता येईल.",
    forgot_missing_email: "कृपया तुमचा ईमेल पत्ता भरा",
    forgot_user_not_found: "या ईमेलसह कोणतेही ॲडमिन खाते सापडले नाही.",
    member_forgot_user_not_found:
      "या ईमेलसह कोणतेही सदस्य खाते सापडले नाही.",
    forgot_success:
      "हा ईमेल नोंदणीकृत असल्यास, OTP पाठवले गेले आहे.",
    forgot_failed_generic: "OTP ईमेल पाठवण्यात अडचण आली",
    forgot_button: "OTP पाठवा",
    otp_rate_limit: "खूप OTP विनंती. कृपया नंतर पुन्हा प्रयत्न करा.",

    reset_title: "पासवर्ड रीसेट",
    reset_subtitle_prefix: "या ईमेलवर पाठवलेला OTP टाका:",
    reset_subtitle_suffix:
      "आणि नवीन पासवर्ड देऊन ॲडमिन खाते रीसेट करा.",
    reset_email_missing:
      "ईमेल उपलब्ध नाही. कृपया पुन्हा पासवर्ड रीसेट प्रक्रिया सुरू करा.",
    reset_otp_missing: "कृपया ईमेलवर आलेला OTP भरा.",
    reset_passwords_missing: "कृपया दोन्ही पासवर्ड फील्ड भरा",
    reset_passwords_mismatch: "दोन्ही पासवर्ड जुळत नाहीत",
    reset_success: "पासवर्ड यशस्वीपणे रीसेट झाला",
    reset_failed_generic: "पासवर्ड रीसेट करण्यात अडचण आली",

    otp_label: "OTP",
    otp_placeholder: "6-अंकी OTP टाका",
    verify_otp_button: "OTP सत्यापित करा",
    otp_verify_success: "OTP सत्यापित झाला. आता नवीन पासवर्ड सेट करा.",
    new_password_label: "नवीन पासवर्ड",
    new_password_placeholder: "नवीन पासवर्ड",
    confirm_new_password_label: "नवीन पासवर्ड पुन्हा टाका",
    confirm_new_password_placeholder: "नवीन पासवर्ड पुन्हा टाका",

    dashboard_title: "ॲडमिन डॅशबोर्ड",
    dashboard_welcome: "स्वागत आहे,",
    logout: "लॉग आउट",
    card_students: "सदस्य व्यवस्थापन",
    card_menu: "मेनू व्यवस्थापन",
    card_expenses: "मेस खर्च",
    card_snacks: "अतिरिक्त स्नॅक्स",
    card_snack_products: "अतिरिक्त स्नॅक्स व्यवस्थापन",
    card_payments: "पेमेंट्स",
    card_reports: "अहवाल",
    card_leave: "रजा मंजुरी",

    footer_forgot_prefix: "पासवर्ड विसरलात?",
    footer_forgot_link: "पासवर्ड रीसेट करा",

    manage_members_meal_plan_label: "जेवण योजना:",
    manage_members_due_payment_label: "थकबाकी पेमेंट:",
    manage_members_call: "कॉल",
    manage_members_edit: "संपादन",
    manage_members_delete: "हटवा",
    manage_members_na: "उपलब्ध नाही",

    manage_members_member_name_label: "सदस्य नाव (इंग्रजी किंवा मराठी) *",
    manage_members_room_owner_label: "रूम मालक (इंग्रजी किंवा मराठी) *",
    manage_members_member_name_placeholder: "उदा. John Doe किंवा राजेश पाटील",
    manage_members_room_owner_placeholder: "उदा. John Doe किंवा मालकाचे नाव",
    manage_members_member_other_script: "सदस्य — दुसरी भाषा (पर्यायी)",
    manage_members_room_other_script: "रूम मालक — दुसरी भाषा (पर्यायी)",
    manage_members_other_script_hint:
      "वरील फील्ड इंग्रजी असल्यास येथे मराठी. मराठी असल्यास येथे इंग्रजी, किंवा रिकामे ठेवून भाषांतर.",
    manage_members_validation_required:
      "सदस्य नाव, रूम मालक आणि फोन आवश्यक आहेत.",
    manage_members_validation_password_required:
      "कृपया पासवर्ड टाका.",
    manage_members_validation_name_min: "सदस्य नाव किमान 2 अक्षरे असावे.",
    manage_members_validation_name_chars:
      "नावात फक्त अक्षरे (इंग्रजी किंवा मराठी), रिकामी जागा किंवा '.' वापरा.",
    manage_members_validation_room_chars:
      "रूम मालक नावात फक्त अक्षरे (इंग्रजी किंवा मराठी), रिकामी जागा किंवा '.' वापरा.",
    manage_members_validation_phone:
      "फोन नंबरात 7 ते 15 अंक असावेत.",
    manage_members_validation_email: "कृपया वैध ईमेल पत्ता टाका.",
    manage_members_validation_joining_format:
      "जॉइनिंग तारीख YYYY-MM-DD स्वरूपात असावी.",
    manage_members_validation_joining_invalid: "जॉइनिंग तारीख वैध नाही.",
    manage_members_validation_status:
      "स्थिती सक्रिय किंवा निष्क्रिय असावी.",
    manage_members_validation_meal_plan:
      "जेवण योजना दुपारचे, रात्रीचे किंवा दोन्ही असावी.",

    alert_validation_title: "सत्यापन",
    button_cancel: "रद्द करा",

    manage_members_alert_load_failed: "सदस्य लोड करता आले नाहीत",
    manage_members_alert_member_updated: "सदस्य यशस्वीपणे अपडेट झाला",
    manage_members_alert_member_added: "सदस्य यशस्वीपणे जोडला",
    manage_members_alert_member_deleted: "सदस्य यशस्वीपणे हटवला",
    manage_members_alert_delete_title: "सदस्य हटवा",
    manage_members_alert_delete_body:
      "तुम्हाला खात्री आहे, {{name}} हटवायचे आहे?",
    manage_members_alert_delete_failed: "सदस्य हटवता आला नाही",
    manage_members_alert_generic_error: "काहीतरी चूक झाली",
    manage_members_alert_phone_unavailable: "फोन नंबर उपलब्ध नाही",
    manage_members_alert_dialer_error: "डायलर उघडता आला नाही",

    manage_menu_poll_section: "पोल",
    manage_menu_button_create: "तयार करा",
    manage_menu_poll_create_cta: "पोल तयार करा",
    manage_menu_poll_modal_edit: "पोल संपादित करा",
    manage_menu_poll_modal_create: "पोल तयार करा",
    manage_menu_date: "तारीख",
    manage_menu_poll_question: "प्रश्न (इंग्रजी किंवा मराठी)",
    manage_menu_poll_question_ph:
      "उदा. शाकाहारी किंवा मांसाहारी? किंवा Veg or Non-Veg?",
    manage_menu_poll_options: "पर्याय",
    manage_menu_poll_add_option: "+ पर्याय जोडा",
    manage_menu_poll_option_text_ph:
      "उदा. Veg, Non Veg किंवा शाकाहारी / मांसाहारी",
    manage_menu_save: "जतन करा",
    manage_menu_poll_loading: "पोल लोड होत आहे…",
    manage_menu_poll_load_failed: "पोल लोड करता आला नाही.",
    manage_menu_poll_none: "या तारखेसाठी पोल नाही.",
    manage_menu_poll_total_votes: "एकूण मते:",
    manage_menu_poll_validation_options:
      "किमान 2 पर्याय भरा (इंग्रजी किंवा मराठी मजकूर).",
    manage_menu_poll_save_failed: "पोल जतन करता आला नाही.",
    manage_menu_poll_delete_title: "पोल हटवा",
    manage_menu_poll_delete_body: "हा पोल हटवायचा याची खात्री आहे?",
    manage_menu_poll_delete_failed: "पोल हटवता आला नाही.",
    manage_menu_load_failed: "मेनू लोड करता आले नाहीत.",
    manage_menu_delete_menu_title: "मेनू हटवा",
    manage_menu_delete_menu_body: "{{date}} चा मेनू हटवायचा?",
    manage_menu_menu_delete_failed: "मेनू हटवता आला नाही.",
    manage_menu_validation_lunch_dinner: "कृपया दुपारचे किंवा रात्रीचे जेवण भरा.",
    manage_menu_menu_save_failed: "मेनू जतन करता आला नाही.",
    manage_menu_edit_menu: "मेनू संपादित करा",
    manage_menu_add_menu: "मेनू जोडा",
    manage_menu_lunch: "दुपारचे जेवण",
    manage_menu_dinner: "रात्रीचे जेवण",
    manage_menu_lunch_ph: "उदा. भात, डाळ, भाजी, चपाती",
    manage_menu_dinner_ph: "उदा. चपाती, डाळ, करी",
    manage_menu_history: "मागील मेनू",
    manage_menu_poll_history: "मागील पोल",

    member_menu_default_notice:
      "ॲडमिनने आजचा मेनू सेट करेपर्यंत डीफॉल्ट मेनू दाखवत आहोत.",

    qr_scanner_title: "स्नॅक खरेदी क्यूआर स्कॅन करा",
    qr_scanner_requesting_camera: "कॅमेरा परवानगी मागत आहे…",
    qr_scanner_camera_denied_title: "कॅमेरा परवानगी आवश्यक",
    qr_scanner_camera_denied_body:
      "स्नॅक खरेदी क्यूआर स्कॅन करण्यासाठी कॅमेरा परवानगी आवश्यक आहे.",
    qr_scanner_go_back: "मागे जा",
    qr_scanner_helper:
      "सदस्याने स्नॅक खरेदी क्यूआर दाखवावा आणि चौकोनात सरळ ठेवावा.",
    qr_scanner_validating: "ऑर्डर तपासत आहे…",
    qr_scanner_valid_title: "वैध स्नॅक ऑर्डर",
    qr_scanner_mismatch_title: "ऑर्डर जुळत नाही",
    qr_scanner_label_member: "सदस्य",
    qr_scanner_label_snack: "स्नॅक",
    qr_scanner_label_quantity: "प्रमाण",
    qr_scanner_label_total: "एकूण रक्कम",
    qr_scanner_label_order_date: "ऑर्डर तारीख",
    qr_scanner_label_reference: "संदर्भ क्रमांक",
    qr_scanner_scan_again: "पुन्हा स्कॅन करा",
    qr_scanner_ready: "स्कॅनसाठी तयार",
    qr_scanner_na: "उपलब्ध नाही",
    qr_scanner_from_qr: "क्यूआर",
    qr_scanner_err_invalid_json:
      "अवैध क्यूआर. कृपया वैध स्नॅक खरेदी क्यूआर स्कॅन करा.",
    qr_scanner_err_missing_order: "क्यूआरमध्ये ऑर्डर माहिती नाही.",
    qr_scanner_err_bulk_ids: "बल्क क्यूआरमध्ये ऑर्डर आयडी नाहीत.",
    qr_scanner_err_permission: "क्यूआर स्कॅन करण्यासाठी कॅमेरा परवानगी आवश्यक आहे.",
    qr_scanner_alert_validation_failed: "तपासणी अयशस्वी",
    qr_scanner_err_validate_failed: "स्नॅक ऑर्डर तपासता आला नाही",

    extra_snacks_alert_fetch_orders_failed: "स्नॅक ऑर्डर मिळवता आले नाहीत",
    extra_snacks_alert_fetch_products_failed: "स्नॅक आयटम लोड करता आले नाहीत",
    extra_snacks_alert_fetch_members_failed: "सदस्य लोड करता आले नाहीत",
    extra_snacks_alert_order_updated: "स्नॅक ऑर्डर यशस्वीपणे अपडेट झाला",
    extra_snacks_alert_order_added: "स्नॅक ऑर्डर यशस्वीपणे जोडला",
    extra_snacks_alert_save_failed: "स्नॅक ऑर्डर जतन करता आला नाही",
    extra_snacks_alert_delete_title: "स्नॅक ऑर्डर हटवा",
    extra_snacks_alert_delete_body:
      "तुम्हाला {{name}} साठी हा ऑर्डर हटवायचा आहे का?",
    extra_snacks_alert_order_deleted: "स्नॅक ऑर्डर यशस्वीपणे हटवला",
    extra_snacks_alert_delete_failed: "स्नॅक ऑर्डर हटवता आला नाही",
  },
};

const LanguageContext = createContext({
  language: "en",
  toggleLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem("app_language");
        if (stored === "en" || stored === "mr") {
          setLanguage(stored);
        }
      } catch (e) {
        // ignore storage errors and fall back to default
      }
    };

    loadLanguage();
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next = prev === "en" ? "mr" : "en";
      AsyncStorage.setItem("app_language", next).catch(() => {});
      return next;
    });
  };

  const t = (key) => {
    const langTable = translations[language] || translations.en;
    return langTable[key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

