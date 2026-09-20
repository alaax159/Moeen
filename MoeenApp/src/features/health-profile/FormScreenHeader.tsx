import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface FormScreenHeaderProps {
  title: string;
}

export function FormScreenHeader({ title }: FormScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}
      >
        <Ionicons name="arrow-back" size={22} color={theme.text} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
