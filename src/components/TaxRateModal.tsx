import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import NumericPad from './NumericPad';
import TaxPreview from './TaxPreview';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';
import {
  formatPercentageDisplay,
  digitsToTaxRateString,
  taxRateStringToDigits,
} from '../utils/numericPad';
import { lightTap } from '../utils/haptics';

interface TaxRateModalProps {
  visible: boolean;
  currentRate: string;
  currencyCode: string;
  onSave: (rate: string) => void;
  onClose: () => void;
}

export default function TaxRateModal({
  visible,
  currentRate,
  currencyCode,
  onSave,
  onClose,
}: TaxRateModalProps) {
  const [digits, setDigits] = useState(() => taxRateStringToDigits(currentRate));

  // Reset digits when modal opens with a new rate
  useEffect(() => {
    if (visible) {
      setDigits(taxRateStringToDigits(currentRate));
    }
  }, [visible, currentRate]);

  const handleValueChange = useCallback((d: string) => {
    setDigits(d);
  }, []);

  const handleNoTax = useCallback(async () => {
    await lightTap();
    onSave('0');
  }, [onSave]);

  const handleSave = useCallback(async () => {
    await lightTap();
    const rate = digits ? digitsToTaxRateString(digits) : '0';
    onSave(rate);
  }, [digits, onSave]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header with Cancel / Save */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>{strings.menuBuilder.cancel}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{strings.settings.taxRate}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.saveText}>{strings.menuBuilder.save}</Text>
            </TouchableOpacity>
          </View>

          {/* Display */}
          <View style={styles.displayArea}>
            <Text style={styles.percentageDisplay}>{formatPercentageDisplay(digits)}</Text>
            <TaxPreview taxRateDigits={digits} currencyCode={currencyCode} />
          </View>

          {/* Pad */}
          <NumericPad
            mode="percentage"
            value={digits}
            onValueChange={handleValueChange}
            specialKeyLabel={strings.onboarding.taxRateNoTax}
            onSpecialKey={handleNoTax}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  headerTitle: {
    ...typography.bodyBold,
  },
  saveText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  displayArea: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  percentageDisplay: {
    ...typography.total,
  },
});
