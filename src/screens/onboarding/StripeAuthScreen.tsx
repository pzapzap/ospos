import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { register, login } from '../../services/api';
import { lightTap } from '../../utils/haptics';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'StripeAuth'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StripeAuthScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = EMAIL_REGEX.test(email.trim()) && password.length >= 8;

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    await lightTap();
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigation.navigate('StripeOnboarding');
    } catch (err) {
      const title = mode === 'register'
        ? strings.stripeAuth.registerFailed
        : strings.stripeAuth.loginFailed;
      Alert.alert(title, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = async () => {
    await lightTap();
    setMode(mode === 'register' ? 'login' : 'register');
  };

  return (
    <SafeAreaViewCompat style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Back button */}
        <View style={styles.backRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={styles.backText}>{strings.onboarding.back}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>
            {mode === 'register'
              ? strings.stripeAuth.registerTitle
              : strings.stripeAuth.loginTitle}
          </Text>
          <Text style={styles.subtitle}>{strings.stripeAuth.subtitle}</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={strings.stripeAuth.emailPlaceholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={strings.stripeAuth.passwordPlaceholder}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textContentType={mode === 'register' ? 'newPassword' : 'password'}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={[styles.submitButtonText, !isValid && styles.submitButtonTextDisabled]}>
                {mode === 'register'
                  ? strings.stripeAuth.registerButton
                  : strings.stripeAuth.loginButton}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchButton} onPress={toggleMode}>
            <Text style={styles.switchText}>
              {mode === 'register'
                ? strings.stripeAuth.switchToLogin
                : strings.stripeAuth.switchToRegister}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  backRow: {
    height: touchTargets.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.body,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
  },
  title: {
    ...typography.title1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  submitButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
  submitButtonTextDisabled: {
    color: colors.textMuted,
  },
  switchButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    ...typography.body,
    color: colors.primary,
  },
});
