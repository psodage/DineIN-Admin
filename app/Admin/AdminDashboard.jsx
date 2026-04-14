import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import axios from "axios";
import { API_BASE_URL } from "../../config";
import { useAuth } from "../../lib/AuthContext";
import { useLanguage } from "../../LanguageContext";
import LanguageToggle from "../../components/LanguageToggle";

const DASHBOARD_CARDS = [
  { id: "students", titleKey: "card_students", icon: "people" },
  { id: "menu", titleKey: "card_menu", icon: "restaurant" },
  { id: "expenses", titleKey: "card_expenses", icon: "wallet" },
  { id: "snacks", titleKey: "card_snacks", icon: "fast-food" },
  { id: "snackProducts", titleKey: "card_snack_products", icon: "pricetag" },
  { id: "payments", titleKey: "card_payments", icon: "card" },
  { id: "reports", titleKey: "card_reports", icon: "document-text" },
  { id: "leave", titleKey: "card_leave", icon: "calendar" },
];

const AdminDashboard = () => {
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { t } = useLanguage();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const fetchPendingLeaveCount = useCallback(async () => {
    if (!isAuthenticated || loading) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/leave/all`);
      const leaves = Array.isArray(res?.data) ? res.data : [];
      const pending = leaves.filter(
        (item) => String(item?.status || "").toLowerCase() === "pending"
      ).length;
      setPendingLeaveCount(pending);
    } catch (error) {
      setPendingLeaveCount(0);
    }
  }, [isAuthenticated, loading]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      fetchPendingLeaveCount();
      const intervalId = setInterval(fetchPendingLeaveCount, 30000);
      return () => clearInterval(intervalId);
    }, [fetchPendingLeaveCount])
  );

  const handleCardPress = (cardId) => {
    switch (cardId) {
      case "students":
        router.push("/Admin/ManageMembers");
        break;
      case "menu":
        router.push("/Admin/ManageMenu");
        break;
      case "expenses":
        router.push("/Admin/MessExpenses");
        break;
      case "snacks":
        router.push("/Admin/ExtraSnacks");
        break;
      case "snackProducts":
        router.push("/Admin/ManageExtraSnacks");
        break;
      case "payments":
        router.push("/Admin/Payments");
        break;
      case "reports":
        router.push("/Admin/Reports");
        break;
      case "leave":
        router.push("/Admin/LeaveApproval");
        break;
      default:
        break;
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (loading || !isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
        <LanguageToggle />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
     

        <View style={styles.headerRow}>
          <View style={styles.headerTextWrapper}>
            <Text style={styles.title}>{t("dashboard_welcome")}</Text>
            {user?.email && (
              <Text style={styles.subtitle}>{user.email}</Text>
            )}
            <Text style={styles.dateTime}>
              {currentDateTime.toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.qrScannerButton}
            onPress={() => router.push("/Admin/SnackQrScanner")}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {DASHBOARD_CARDS.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={styles.card}
              onPress={() => handleCardPress(card.id)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrapper}>
                <Ionicons name={card.icon} size={28} color="#111827" />
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardTitle}>{t(card.titleKey)}</Text>
                {card.id === "leave" && pendingLeaveCount > 0 ? (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{pendingLeaveCount}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>
            {t("logout")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <LanguageToggle />
    </View>
  );
};

export default AdminDashboard;

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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: 10,
    marginRight: 10,
  },
  headerTextWrapper: {
    flex: 1,
    marginRight: 12,
  },
  logoImage: {
    width: 120,
    height: 80,
    marginTop: -10,
    marginBottom: 30,
    marginLeft: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
    marginLeft: 10,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 24,
    marginLeft: 10,
  },
  dateTime: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
  },
  qrScannerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pendingBadge: {
 marginTop: -120,
 marginLeft: -10,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
  },
  pendingBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    marginLeft: 10,
    height: 48,
    width: "95%",
    borderRadius: 12,
    backgroundColor: "#000000",
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

