import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import SplitScreenBlockedView from "./SplitScreenBlockedView";

export default function AppSecurityWrapper({ children }) {
  const appState = useRef(AppState.currentState);
  const opacity = useRef(new Animated.Value(0)).current;
  const [showOverlay, setShowOverlay] = useState(false);
  const windowDims = useWindowDimensions();
  const [screenDims, setScreenDims] = useState(Dimensions.get("screen"));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => {
      if (screen) {
        setScreenDims(screen);
      }
    });
    return () => {
      // React Native 0.81 returns an object with remove()
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    const setBlurred = (blurred) => {
      if (blurred) {
        setShowOverlay(true);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setShowOverlay(false);
        });
      }
    };

    const onChange = (nextAppState) => {
      appState.current = nextAppState;
      setBlurred(nextAppState !== "active");
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [opacity]);

  const isAndroid = Platform.OS === "android";
  const isSplitScreen =
    isAndroid &&
    screenDims &&
    windowDims &&
    (windowDims.width < screenDims.width * 0.9 ||
      windowDims.height < screenDims.height * 0.9);

  const handleRequestFullScreen = () => {
    // We cannot programmatically exit split-screen, so gently instruct the user.
    if (isAndroid) {
      Alert.alert(
        "Return to full screen",
        "Please exit split-screen or multi-window mode to continue using DineIN."
      );
    }
  };

  return (
    <View style={styles.container}>
      {children}

      {isSplitScreen && (
        <View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFill, styles.blockingOverlay]}
        >
          <SplitScreenBlockedView onRequestFullScreen={handleRequestFullScreen} />
        </View>
      )}

      {!isSplitScreen && showOverlay && (
        <Animated.View
          pointerEvents="auto"
          style={[StyleSheet.absoluteFill, { opacity }]}
        >
          <BlurView
            intensity={55}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          {Platform.OS === "android" && (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(255,255,255,0.18)" },
              ]}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  blockingOverlay: {
    backgroundColor: "#020617",
  },
});

