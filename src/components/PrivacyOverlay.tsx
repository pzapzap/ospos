import React, { useEffect, useState } from 'react';
import { AppState, AppStateStatus, View, Text, StyleSheet, Image } from 'react-native';
import { colors, fonts } from '../constants/theme';

// Renders a full-screen brand overlay whenever the app is not active
// (inactive or background). iOS takes the app-switcher snapshot during the
// 'inactive' transition, so this overlay covers any sensitive UI (Payment,
// Receipt, TransactionDetail) before the snapshot is captured.
export default function PrivacyOverlay() {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  if (appState === 'active') return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Image
        source={require('../../assets/brand/icon-app.png')}
        style={styles.logo}
      />
      <Text style={styles.brand}>OSPOS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 16,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primary,
    letterSpacing: -0.5,
  },
});
