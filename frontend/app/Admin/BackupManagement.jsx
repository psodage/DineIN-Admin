import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/AuthContext";
import {
  listBackupFiles,
  restoreBackupByFile,
  restoreLatestBackup,
  runBackupNow,
} from "../../lib/api";
import { RESTORE_CONFIRM_PHRASE } from "../../config";

function formatBytes(size) {
  const n = Number(size || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BackupManagement() {
  const router = useRouter();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringLatest, setRestoringLatest] = useState(false);
  const [restoringFileName, setRestoringFileName] = useState("");
  const [files, setFiles] = useState([]);

  const refreshFiles = useCallback(async () => {
    try {
      setLoading(true);
      const next = await listBackupFiles();
      setFiles(next);
    } catch (error) {
      Alert.alert("Error", error?.response?.data?.message || "Failed to fetch backups");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (isAuthenticated) refreshFiles();
  }, [authLoading, isAuthenticated, refreshFiles, router]);

  const latestFile = useMemo(() => (files.length ? files[0] : null), [files]);

  const onRunBackupNow = useCallback(async () => {
    try {
      setBackingUp(true);
      await runBackupNow();
      Alert.alert("Success", "Backup completed successfully.");
      await refreshFiles();
    } catch (error) {
      Alert.alert("Backup Failed", error?.response?.data?.message || "Could not run backup");
    } finally {
      setBackingUp(false);
    }
  }, [refreshFiles]);

  const confirmRestoreAction = useCallback((action) => {
    Alert.alert(
      "Restore Confirmation",
      "This will overwrite current database data. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "Are you absolutely sure? This action cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Yes, Restore", style: "destructive", onPress: action },
              ]
            );
          },
        },
      ]
    );
  }, []);

  const onRestoreLatest = useCallback(() => {
    if (restoringLatest) return;
    confirmRestoreAction(async () => {
      try {
        setRestoringLatest(true);
        const result = await restoreLatestBackup(RESTORE_CONFIRM_PHRASE);
        Alert.alert(
          "Restore Complete",
          `Restored latest backup: ${result?.restoredFileName || "unknown"}`
        );
      } catch (error) {
        Alert.alert("Restore Failed", error?.response?.data?.message || "Could not restore");
      } finally {
        setRestoringLatest(false);
      }
    });
  }, [confirmRestoreAction, restoringLatest]);

  const onRestoreFile = useCallback(
    (fileName) => {
      if (!fileName || restoringFileName) return;
      confirmRestoreAction(async () => {
        try {
          setRestoringFileName(fileName);
          await restoreBackupByFile(fileName, RESTORE_CONFIRM_PHRASE);
          Alert.alert("Restore Complete", `Restored backup: ${fileName}`);
        } catch (error) {
          Alert.alert("Restore Failed", error?.response?.data?.message || "Could not restore");
        } finally {
          setRestoringFileName("");
        }
      });
    },
    [confirmRestoreAction, restoringFileName]
  );

  if (authLoading || !isAuthenticated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Backup Management</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, backingUp && styles.buttonDisabled]}
          onPress={onRunBackupNow}
          disabled={backingUp}
        >
          {backingUp ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.primaryButtonText}>
            {backingUp ? "Running Backup..." : "Run Backup Now"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dangerButton, restoringLatest && styles.buttonDisabled]}
          onPress={onRestoreLatest}
          disabled={restoringLatest}
        >
          {restoringLatest ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="refresh-circle-outline" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.dangerButtonText}>
            {restoringLatest ? "Restoring Latest..." : "Restore Latest Backup"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={refreshFiles} disabled={loading}>
          <Ionicons name="refresh-outline" size={18} color="#111827" />
          <Text style={styles.secondaryButtonText}>Refresh Backup List</Text>
        </TouchableOpacity>
      </View>

      {latestFile ? (
        <View style={styles.latestCard}>
          <Text style={styles.latestTitle}>Latest Backup</Text>
          <Text style={styles.latestName}>{latestFile.name}</Text>
          <Text style={styles.latestMeta}>
            {new Date(latestFile.modTime || Date.now()).toLocaleString()} • {formatBytes(latestFile.size)}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.name}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No backups found.</Text>}
          renderItem={({ item }) => {
            const restoringThis = restoringFileName === item.name;
            return (
              <View style={styles.fileCard}>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName}>{item.name}</Text>
                  <Text style={styles.fileMeta}>
                    {new Date(item.modTime || Date.now()).toLocaleString()} • {formatBytes(item.size)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.restoreFileButton, restoringThis && styles.buttonDisabled]}
                  onPress={() => onRestoreFile(item.name)}
                  disabled={!!restoringFileName}
                >
                  {restoringThis ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="download-outline" size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.restoreFileButtonText}>Restore</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backButton: { padding: 8, marginRight: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  actions: { padding: 16, gap: 10 },
  primaryButton: {
    height: 46,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  dangerButton: {
    height: 46,
    borderRadius: 10,
    backgroundColor: "#B91C1C",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  dangerButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  secondaryButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: { color: "#111827", fontSize: 14, fontWeight: "600" },
  buttonDisabled: { opacity: 0.7 },
  latestCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  latestTitle: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  latestName: { fontSize: 15, color: "#111827", fontWeight: "700" },
  latestMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  listContent: { padding: 16, paddingTop: 8, paddingBottom: 24 },
  fileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fileInfo: { flex: 1 },
  fileName: { color: "#111827", fontWeight: "600", fontSize: 14 },
  fileMeta: { color: "#6B7280", fontSize: 12, marginTop: 4 },
  restoreFileButton: {
    minWidth: 92,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
  },
  restoreFileButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
  emptyText: { textAlign: "center", color: "#6B7280", marginTop: 40, fontSize: 14 },
});
