import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

export function PrivateSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const t = useT();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[
        styles.switch,
        { borderColor: value ? theme.accent : theme.border },
        value && { backgroundColor: theme.accent },
        disabled && styles.disabled,
      ]}>
      <ThemedText type="smallBold" themeColor={value ? 'onAccent' : 'text'}>
        {t('vault.keepPrivate')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switch: {
    minHeight: MinTouchTarget,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  disabled: {
    opacity: 0.4,
  },
});
