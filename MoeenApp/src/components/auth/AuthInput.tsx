import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    type TextInputProps,
    useColorScheme,
    View,
} from "react-native";

import { Colors, Radius, Spacing, Typography } from "@/constants/theme";

type AuthInputProps = TextInputProps & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;

  rightLabel?: string;
  onRightLabelPress?: () => void;
};

export default function AuthInput({
  label,
  icon,
  isPassword = false,
  rightLabel,
  onRightLabelPress,
  ...textInputProps
}: AuthInputProps) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

        {rightLabel && (
          <Pressable onPress={onRightLabelPress}>
            <Text style={[styles.rightLabel, { color: colors.primary }]}>
              {rightLabel}
            </Text>
          </Pressable>
        )}
      </View>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.background,
            borderColor: focused ? colors.primary : colors.backgroundSelected,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={focused ? colors.primary : colors.textSecondary}
        />

        <TextInput
          {...textInputProps}
          onFocus={(event) => {
            setFocused(true);
            textInputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            textInputProps.onBlur?.(event);
          }}
          secureTextEntry={isPassword && !passwordVisible}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text }, textInputProps.style]}
        />

        {isPassword && (
          <Pressable onPress={() => setPasswordVisible((current) => !current)}>
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={21}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.three,
  },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },

  label: {
    ...Typography.label,
  },

  rightLabel: {
    ...Typography.label,
  },

  inputContainer: {
    minHeight: 54,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  input: {
    flex: 1,
    ...Typography.body,
    fontSize: 15,
    paddingVertical: 14,
  },
});
