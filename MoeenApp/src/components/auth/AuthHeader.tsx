import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

import { Colors, Radius, Spacing, Typography } from "@/constants/theme";

type AuthHeaderProps = {
  title: string;
  subtitle: string;
};

export default function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.container}>
      <View
        style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}
      >
        <Ionicons name="medical-outline" size={34} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: Spacing.five,
  },

  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: Radius.large,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.four,
  },

  title: {
    ...Typography.screenTitle,
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
    marginBottom: Spacing.two,
  },

  subtitle: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 300,
  },
});
