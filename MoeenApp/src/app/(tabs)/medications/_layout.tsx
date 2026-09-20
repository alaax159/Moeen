import { PrescriptionDraftProvider } from '@/features/prescription-scan/context';
import { Stack } from 'expo-router';

export default function MedicationsLayout() {
  return (
    <PrescriptionDraftProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="search" />
        <Stack.Screen name="add" />
        <Stack.Screen name="prescription-scan" />
        <Stack.Screen name="prescription-review" />
        <Stack.Screen name="update" />
        <Stack.Screen name="[id]" />
      </Stack>
    </PrescriptionDraftProvider>
  );
}
