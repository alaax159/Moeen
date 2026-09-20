import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function EmergencyHelpIconButton() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Emergency help"
      accessibilityHint="Opens emergency help options on the Profile screen"
      hitSlop={8}
      onPress={() => router.push('/profile' as Href)}
      style={[styles.button, { backgroundColor: theme.dangerLight }]}
    >
      <Ionicons name="medical" size={22} color={theme.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7A2E2E',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});
