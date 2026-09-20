import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import type { AllergySeverity } from './types';
import { SEVERITY_LABEL } from './utils';

interface SeverityBadgeProps {
  severity: AllergySeverity;
}

function getSeverityColors(severity: AllergySeverity, theme: ReturnType<typeof useTheme>) {
  switch (severity) {
    case 'severe':
      return { bg: theme.dangerLight, fg: theme.danger };
    case 'moderate':
      return { bg: theme.warningLight, fg: theme.warning };
    case 'mild':
    default:
      return { bg: theme.primaryLight, fg: theme.primaryDark };
  }
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const theme = useTheme();
  const colors = getSeverityColors(severity, theme);

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>{SEVERITY_LABEL[severity]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  text: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
});
