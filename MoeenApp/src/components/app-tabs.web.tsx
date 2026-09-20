import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, useColorScheme, View } from "react-native";

import { ExternalLink } from "./external-link";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { Colors, MaxContentWidth } from "@/constants/theme";

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: "100%" }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="medications" href="/medications" asChild>
            <TabButton>Meds</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? "backgroundSelected" : "backgroundElement"}
        style={styles.tabButtonView}
      >
        <ThemedText
          type="small"
          themeColor={isFocused ? "text" : "textSecondary"}
        >
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          Expo Starter
        </ThemedText>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={styles.externalPressable}>
            <ThemedText type="link">Docs</ThemedText>
            <SymbolView
              tintColor={colors.text}
              name={{ ios: "arrow.up.right.square", web: "link" }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: "absolute",
    width: "100%",
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  innerContainer: {
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    gap: 8,
    maxWidth: MaxContentWidth,
    shadowColor: "#173E2A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  brandText: {
    marginRight: "auto",
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.72,
  },
  tabButtonView: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    justifyContent: "center",
  },
  externalPressable: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    marginLeft: 10,
  },
});
