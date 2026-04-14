import React, { useEffect, useRef } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  View,
  Animated,
  Easing,
} from "react-native";
import { useLanguage } from "../LanguageContext";

const LanguageToggle = () => {
  const { language, toggleLanguage } = useLanguage();
  const progress = useRef(new Animated.Value(language === "en" ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: language === "en" ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [language, progress]);

  const sliderTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 26],
  });

  const enOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.45],
  });

  const mrOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={toggleLanguage}
      activeOpacity={0.9}
    >
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.slider,
            {
              transform: [{ translateX: sliderTranslateX }],
            },
          ]}
        />
        <Animated.Text style={[styles.label, styles.labelLeft, { opacity: enOpacity }]}>
          EN
        </Animated.Text>
        <Animated.Text style={[styles.label, styles.labelRight, { opacity: mrOpacity }]}>
          MR
        </Animated.Text>
      </View>
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
    borderRadius: 20,
    padding: 2,
    backgroundColor: "rgb(17, 24, 39)",
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    width: 56,
    height: 30,
    borderRadius: 16,
    backgroundColor: "rgb(61, 70, 84)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  slider: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgb(17, 24, 39)",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgb(255, 255, 255)",
    zIndex: 1,
  },
  labelLeft: {
    marginLeft: 1,
  },
  labelRight: {
    marginRight: 1,
  },
});

