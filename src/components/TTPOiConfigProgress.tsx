import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';

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
          <View style={styles.doneRow}>
            <Button
              label={strings.ttpoi.configDone}
              variant="primary"
              size="lg"
              onPress={onDone}
            />
          </View>
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
  doneRow: {
    minWidth: 200,
  },
});
