import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="personal-info" />
      <Stack.Screen name="allergy-add" />
      <Stack.Screen name="condition-add" />
      <Stack.Screen name="emergency-support" />
      <Stack.Screen name="emergency-contacts" />
    </Stack>
  );
}
