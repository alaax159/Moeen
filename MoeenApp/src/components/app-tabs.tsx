import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { Colors, Fonts } from "@/constants/theme";

const INACTIVE_TAB_COLOR = "#8A9990";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <NativeTabs
      backgroundColor={colors.background}
      disableIndicator
      disableTransparentOnScrollEdge
      labelVisibilityMode="labeled"
      rippleColor="transparent"
      iconColor={{
        default: INACTIVE_TAB_COLOR,
        selected: colors.primary,
      }}
      labelStyle={{
        default: {
          color: INACTIVE_TAB_COLOR,
          fontFamily: Fonts.sans,
          fontSize: 11,
          fontWeight: "600",
        },
        selected: {
          color: colors.primary,
          fontFamily: Fonts.sans,
          fontSize: 11,
          fontWeight: "700",
        },
      }}
      shadowColor="#D8E1DA"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house" }}
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person", selected: "person" }}
          md="person"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="medications">
        <NativeTabs.Trigger.Label>Medications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "pills", selected: "pills" }}
          md="pill"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "message", selected: "message.fill" }}
          md="chat"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "chart.bar", selected: "chart.bar" }}
          md="bar_chart"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
