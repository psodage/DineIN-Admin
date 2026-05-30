import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/AuthContext";

interface AuthUser {
  role?: string;
}

export default function Index() {
  const router = useRouter();
  const {
    isAuthenticated,
    loading,
    user,
  } = useAuth() as {
    isAuthenticated: boolean;
    loading: boolean;
    user: AuthUser | null;
  };
  useEffect(() => {
    if (loading) return;
    const isAdmin =
      isAuthenticated &&
      (!user?.role || String(user.role).toLowerCase() === "admin");
    router.replace(
      (isAdmin ? "/Admin/AdminDashboard" : "/Admin/AdminLoginScreen") as any
    );
  }, [loading, isAuthenticated, user, router]);

  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#111827" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
});
