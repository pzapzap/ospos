import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TTPOiAwarenessModalProps {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

export default function TTPOiAwarenessModal({
  visible,
  onEnable,
  onDismiss,
}: TTPOiAwarenessModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{strings.ttpoi.awarenessTitle}</Text>
          <Text style={styles.subtitle}>{strings.ttpoi.awarenessSubtitle}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.enableButton}
              onPress={onEnable}
              activeOpacity={0.7}
              accessibilityLabel="Enable Tap to Pay on iPhone"
              accessibilityRole="button"
            >
              <Text style={styles.enableButtonText}>
                {strings.ttpoi.awarenessEnable}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissButton}
              onPress={onDismiss}
              activeOpacity={0.7}
              accessibilityLabel="Not now, dismiss"
              accessibilityRole="button"
            >
              <Text style={styles.dismissButtonText}>
                {strings.ttpoi.awarenessNotNow}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>{strings.ttpoi.disclaimerShort}</Text>
        </View>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: spacing.xxxl,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  title: {
    ...typography.title1,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  enableButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  enableButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
  dismissButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  dismissButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
