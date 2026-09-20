import { Stack } from 'expo-router';

export default function MedicationsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="search" />
      <Stack.Screen name="add" />
    </Stack>
  );
}