import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    useColorScheme,
} from "react-native";

import { Colors, Radius, Typography } from "@/constants/theme";

type AuthButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export default function AuthButton({
  title,
  onPress,
  loading = false,
  disabled = false,
}: AuthButtonProps) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const isDisabled = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primary },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={[styles.text, { color: colors.onPrimary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: Radius.control,
    shadowColor: "#173E2A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  text: {
    ...Typography.button,
    fontSize: 15,
  },

  pressed: {
    opacity: 0.85,
  },

  disabled: {
    opacity: 0.6,
  },
});
