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
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { colors, typography, spacing, borderRadius, touchTargets } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { register, login, loginWithApple, loginWithGoogle } from '../../services/api';
import Button from '../../components/Button';
import { lightTap } from '../../utils/haptics';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'StripeAuth'>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Google Sign-In (Android) needs the OAuth *web* client id so the returned
// idToken can be verified server-side (its aud must match GOOGLE_CLIENT_ID).
if (Platform.OS === 'android') {
  GoogleSignin.configure({
    webClientId: '677211546052-1irpevohdep32rg28rrtpf0fv39lf3im.apps.googleusercontent.com',
  });
}

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

  const handleAppleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const fullName = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
        : null;

      await loginWithApple(
        credential.identityToken,
        credential.email,
        fullName
      );

      navigation.navigate('StripeOnboarding');
    } catch (err: unknown) {
      // User cancelled — don't show error
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      Alert.alert('Sign in with Apple Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const googleUser = response.data?.user;
      const fullName = googleUser
        ? [googleUser.givenName, googleUser.familyName].filter(Boolean).join(' ')
        : null;

      await loginWithGoogle(idToken, googleUser?.email, fullName);

      navigation.navigate('StripeOnboarding');
    } catch (err: unknown) {
      // User cancelled — don't show error
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'SIGN_IN_CANCELLED') {
        return;
      }
      Alert.alert('Sign in with Google Failed', err instanceof Error ? err.message : 'Please try again.');
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

          {/* Sign in with Apple — Apple requires it to be prominent */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={borderRadius.md}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Sign in with Google — Android's social login */}
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              activeOpacity={0.7}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
            >
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </TouchableOpacity>
          )}

          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

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

          <Button
            label={
              loading
                ? '…'
                : mode === 'register'
                  ? strings.stripeAuth.registerButton
                  : strings.stripeAuth.loginButton
            }
            variant="primary"
            size="lg"
            onPress={handleSubmit}
            disabled={!isValid || loading}
          />

          <View style={styles.switchRow}>
            <Button
              label={
                mode === 'register'
                  ? strings.stripeAuth.switchToLogin
                  : strings.stripeAuth.switchToRegister
              }
              variant="ghost"
              size="md"
              onPress={toggleMode}
            />
          </View>
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
  appleButton: {
    height: touchTargets.chargeButton,
    marginBottom: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    height: touchTargets.chargeButton,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  googleButtonText: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 18,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.body,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
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
  switchRow: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
