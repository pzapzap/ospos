import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { typography, spacing, colors } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';
import ContactlessIcon from './ContactlessIcon';

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
          {/* iOS: Apple-required marketing hero. Android: platform-appropriate value prop
              (Apple's official artwork must not ship on Android). */}
          {Platform.OS === 'ios' ? (
            <Image
              source={require('../../assets/images/ttpoi-hero-9x16.jpg')}
              style={styles.heroImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.androidHero}>
              <ContactlessIcon size={72} color={colors.primary} />
              <Text style={styles.androidTitle}>{strings.ttpoi.awarenessTitle}</Text>
              <Text style={styles.androidSubtitle}>{strings.ttpoi.awarenessSubtitle}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Button
              label={strings.ttpoi.awarenessEnable}
              variant="primary"
              size="lg"
              onPress={onEnable}
              accessibilityLabel={`Enable ${strings.ttpoi.sectionTitle}`}
            />
            <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <Button
                label={strings.ttpoi.awarenessNotNow}
                variant="ghost"
                size="md"
                onPress={onDismiss}
                accessibilityLabel="Not now, dismiss"
              />
            </View>
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
  androidHero: {
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  androidTitle: {
    ...typography.title1,
    color: '#09090B',
    textAlign: 'center',
  },
  androidSubtitle: {
    ...typography.body,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  disclaimer: {
    ...typography.caption,
    color: '#999999',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
