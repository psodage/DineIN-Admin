import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLanguage } from "../LanguageContext";

const LanguageToggle = () => {
const { language, toggleLanguage } = useLanguage();

  return (
    <TouchableOpacity style={styles.container} onPress={toggleLanguage}>
      <MaterialIcons
        name="language"
        size={18}
        color="#FFFFFF"
        style={[
          styles.icon,
          language === "en" ? styles.iconEnActive : styles.iconMrActive,
        ]}
      />
    </TouchableOpacity>
  );
};

export default LanguageToggle;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 80,
    right: 24,
    zIndex: 999,
    elevation: 999,
    backgroundColor: "#111827",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    opacity: 0.9,
  },
  iconEnActive: {
    transform: [{ rotate: "0deg" }],
  },
  iconMrActive: {
    transform: [{ rotate: "180deg" }],
  },
});

