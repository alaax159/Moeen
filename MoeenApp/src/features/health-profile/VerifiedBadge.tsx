import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface VerifiedBadgeProps {
  isVerified: boolean;
}

export function VerifiedBadge({ isVerified }: VerifiedBadgeProps) {
  const theme = useTheme();

  const backgroundColor = isVerified ? theme.primaryLight : theme.backgroundSelected;
  const color = isVerified ? theme.primary : theme.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color }]}>
        {isVerified ? 'Verified' : 'Not Verified'}
      </Text>
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
