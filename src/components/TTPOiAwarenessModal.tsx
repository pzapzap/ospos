import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { typography, spacing } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';

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
            <Button
              label={strings.ttpoi.awarenessEnable}
              variant="primary"
              size="lg"
              onPress={onEnable}
              accessibilityLabel="Enable Tap to Pay on iPhone"
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
