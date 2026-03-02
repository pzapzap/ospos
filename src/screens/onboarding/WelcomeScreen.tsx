import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, touchTargets } from '../../constants/theme';
import { lightTap } from '../../utils/haptics';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoScale, contentOpacity]);

  return (
    <SafeAreaViewCompat style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          <Image
            source={require('../../../assets/brand/icon-app.png')}
            style={styles.logo}
          />
        </Animated.View>

        <Text style={styles.title}>Welcome to OSPOS</Text>
        <Text style={styles.subtitle}>
          The open-source point of sale{'\n'}for small businesses
        </Text>

        <Animated.View style={[styles.bottom, { opacity: contentOpacity }]}>
          <TouchableOpacity
            style={styles.getStartedButton}
            onPress={async () => {
              await lightTap();
              navigation.navigate('ModeSelect');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.getStartedText}>Get Started</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  logoContainer: {
    marginBottom: spacing.xxxl,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  title: {
    ...typography.largeTitle,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottom: {
    position: 'absolute',
    bottom: spacing.xxxl,
    left: spacing.xxl,
    right: spacing.xxl,
  },
  getStartedButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
  },
  getStartedText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
});
