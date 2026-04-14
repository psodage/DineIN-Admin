import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function SplitScreenBlockedView({ onRequestFullScreen }) {
  const handlePress = () => {
    if (typeof onRequestFullScreen === "function") {
      onRequestFullScreen();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Split Screen Not Supported</Text>
        <Text style={styles.description}>
          For security reasons, this app must run in full screen mode.
        </Text>

        <Pressable style={styles.button} onPress={handlePress}>
          <Text style={styles.buttonText}>Return to Full Screen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#020617",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    backgroundColor: "rgba(15,23,42,0.96)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.5)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#E5E7EB",
    textAlign: "center",
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: "#2563EB",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F9FAFB",
  },
});

