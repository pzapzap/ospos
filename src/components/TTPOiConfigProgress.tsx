import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';

interface TTPOiConfigProgressProps {
  isComplete: boolean;
  onDone: () => void;
}

export default function TTPOiConfigProgress({
  isComplete,
  onDone,
}: TTPOiConfigProgressProps) {
  return (
    <View style={styles.container}>
      {isComplete ? (
        <>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>{strings.ttpoi.configured}</Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onDone}
            activeOpacity={0.7}
          >
            <Text style={styles.doneButtonText}>{strings.ttpoi.configDone}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>{strings.ttpoi.configuring}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.xl,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.title3,
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
  },
  doneButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 16,
  },
});
