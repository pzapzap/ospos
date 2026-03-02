import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { useApp } from '../state/AppContext';
import {
  getDisputes,
  submitDisputeEvidence,
  type DisputeRecord,
} from '../services/api';

interface DisputesScreenProps {
  onBack: () => void;
}

export default function DisputesScreen({ onBack }: DisputesScreenProps) {
  const { settings } = useApp();
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeRecord | null>(null);
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceImageUri, setEvidenceImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadDisputes = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const result = await getDisputes();
      setDisputes(result.disputes);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDisputes();
    }, [loadDisputes])
  );

  const handlePickImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setEvidenceImageUri(result.assets[0].uri);
    }
  };

  const handleSubmitEvidence = async () => {
    if (!selectedDispute) return;
    if (!evidenceText.trim() && !evidenceImageUri) {
      Alert.alert('Error', 'Please provide evidence text or an image');
      return;
    }

    setSubmitting(true);
    try {
      await submitDisputeEvidence(
        selectedDispute.id,
        evidenceText.trim(),
        evidenceImageUri ?? undefined
      );
      Alert.alert('Success', 'Evidence submitted successfully');
      setSelectedDispute(null);
      setEvidenceText('');
      setEvidenceImageUri(null);
      await loadDisputes();
    } catch {
      Alert.alert('Failed', 'Could not submit evidence. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getDeadlineText = (deadline: string | null): string => {
    if (!deadline) return 'No deadline';
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Deadline passed';
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    return `${diffDays} days left`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'needs_response': return colors.warning;
      case 'under_review': return colors.textSecondary;
      case 'won': return colors.primary;
      case 'lost': return colors.danger;
      default: return colors.textSecondary;
    }
  };

  const renderDispute = ({ item }: { item: DisputeRecord }) => (
    <TouchableOpacity
      style={styles.disputeRow}
      onPress={() => setSelectedDispute(item)}
    >
      <View style={styles.disputeLeft}>
        <Text style={styles.disputeAmount}>
          {formatCurrency(item.amount, settings.currency)}
        </Text>
        <Text style={styles.disputeDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.disputeRight}>
        <Text style={[styles.disputeStatus, { color: getStatusColor(item.status) }]}>
          {item.status.split('_').join(' ')}
        </Text>
        <Text style={styles.disputeDeadline}>{getDeadlineText(item.deadline)}</Text>
      </View>
    </TouchableOpacity>
  );

  // Detail/evidence view
  if (selectedDispute) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity
            onPress={() => setSelectedDispute(null)}
            style={styles.backButton}
          >
            <Text style={styles.backText}>← Back to list</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Dispute Detail</Text>

          <View style={styles.detailCard}>
            <Text style={styles.detailAmount}>
              {formatCurrency(selectedDispute.amount, settings.currency)}
            </Text>
            <Text style={styles.detailReason}>
              Reason: {selectedDispute.reason ?? 'Not specified'}
            </Text>
            <Text style={[styles.detailStatus, { color: getStatusColor(selectedDispute.status) }]}>
              Status: {selectedDispute.status.split('_').join(' ')}
            </Text>
            <Text style={styles.detailDeadline}>
              Deadline: {getDeadlineText(selectedDispute.deadline)}
            </Text>
            {selectedDispute.evidence_submitted ? (
              <Text style={styles.evidenceSubmitted}>
                Evidence submitted on {new Date(selectedDispute.updated_at).toLocaleDateString()}
              </Text>
            ) : null}
          </View>

          {!selectedDispute.evidence_submitted && selectedDispute.status === 'needs_response' ? (
            <View style={styles.evidenceForm}>
              <Text style={styles.sectionTitle}>Submit Evidence</Text>

              <TextInput
                style={styles.evidenceInput}
                value={evidenceText}
                onChangeText={setEvidenceText}
                placeholder="Explain the charge..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
                <Text style={styles.photoButtonText}>
                  {evidenceImageUri ? 'Photo selected ✓' : 'Take Photo of Evidence'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.submitDisabled]}
                onPress={handleSubmitEvidence}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitText}>Submit Evidence</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Disputes</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : loadError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Failed to load disputes</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadDisputes}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : disputes.length === 0 ? (
          <Text style={styles.emptyText}>No active disputes</Text>
        ) : (
          <FlatList
            data={disputes}
            keyExtractor={(item) => item.id}
            renderItem={renderDispute}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  backButton: {
    paddingVertical: spacing.lg,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.title1,
    marginBottom: spacing.xl,
  },
  loader: {
    marginTop: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxxl,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  disputeRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  disputeLeft: {
    flex: 1,
  },
  disputeAmount: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  disputeDate: {
    ...typography.caption,
  },
  disputeRight: {
    alignItems: 'flex-end',
  },
  disputeStatus: {
    ...typography.bodyBold,
    fontSize: 13,
    textTransform: 'capitalize',
    marginBottom: spacing.xs,
  },
  disputeDeadline: {
    ...typography.caption,
    color: colors.warning,
  },
  // Detail view
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  detailAmount: {
    ...typography.title1,
    marginBottom: spacing.sm,
  },
  detailReason: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detailStatus: {
    ...typography.bodyBold,
    textTransform: 'capitalize',
  },
  detailDeadline: {
    ...typography.body,
    color: colors.warning,
  },
  evidenceSubmitted: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  evidenceForm: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  evidenceInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
  },
  photoButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  photoButtonText: {
    ...typography.body,
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    ...typography.bodyBold,
    color: colors.black,
  },
});
