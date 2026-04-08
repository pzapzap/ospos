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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
          {/* Apple Hero banner — required marketing asset */}
          <Image
            source={require('../../assets/images/ttpoi-hero-9x16.jpg')}
            style={styles.heroImage}
            resizeMode="contain"
          />

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
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  heroImage: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_HEIGHT * 0.55,
    marginBottom: spacing.xxl,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  enableButton: {
    backgroundColor: '#000000',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  enableButtonText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
    fontSize: 18,
  },
  dismissButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  dismissButtonText: {
    ...typography.body,
    color: '#666666',
  },
  disclaimer: {
    ...typography.caption,
    color: '#999999',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
