import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import { getActiveInteractions, type ActiveInteraction } from "./api";

const SEVERITY_LABEL: Record<string, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  high: "High",
  moderate: "Moderate",
  medium: "Medium",
  minor: "Minor",
  low: "Low",
};

const TYPE_LABEL: Record<ActiveInteraction["warningType"], string> = {
  drug_drug: "Drug interaction",
  drug_allergy: "Allergy conflict",
  drug_condition: "Condition caution",
};

export function ActiveInteractionsCard() {
  const theme = useTheme();

  const [interactions, setInteractions] = useState<ActiveInteraction[]>([]);

  const [loadError, setLoadError] = useState(false);

  const requestGeneration = useRef(0);

  const loadInteractions = useCallback(async () => {
    const generation = ++requestGeneration.current;

    try {
      const data = await getActiveInteractions();

      if (generation !== requestGeneration.current) {
        return;
      }

      setInteractions(data);
      setLoadError(false);
    } catch {
      if (generation !== requestGeneration.current) {
        return;
      }

      setInteractions([]);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInteractions();

      return () => {
        requestGeneration.current += 1;
      };
    }, [loadInteractions]),
  );

  if (loadError) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[styles.iconBadge, { backgroundColor: theme.warningLight }]}
          >
            <Ionicons name="warning-outline" size={18} color={theme.warning} />
          </View>

          <View style={styles.errorContent}>
            <Text style={[styles.title, { color: theme.text }]}>
              Active interactions
            </Text>

            <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>
              Couldn&apos;t load medication safety information. Please try
              again.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const visibleInteractions = interactions.slice(0, 3);
  const remainingCount = interactions.length - visibleInteractions.length;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[styles.iconBadge, { backgroundColor: theme.warningLight }]}
          >
            <Ionicons name="warning-outline" size={18} color={theme.warning} />
          </View>

          <View>
            <Text style={[styles.title, { color: theme.text }]}>
              Active interactions
            </Text>

            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Review current medication safety findings
            </Text>
          </View>
        </View>

        <View
          style={[styles.countBadge, { backgroundColor: theme.warningLight }]}
        >
          <Text style={[styles.countText, { color: theme.warning }]}>
            {interactions.length}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {visibleInteractions.map((interaction, index) => {
          const severityKey = interaction.severity.toLowerCase();

          const isSevere =
            severityKey === "contraindicated" ||
            severityKey === "major" ||
            severityKey === "high";

          const accentColor = isSevere ? theme.danger : theme.warning;

          const accentBackground = isSevere
            ? theme.dangerLight
            : theme.warningLight;

          return (
            <View
              key={`${interaction.warningType}-${interaction.message}-${index}`}
              style={[
                styles.interactionRow,
                {
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            >
              <View style={styles.rowTop}>
                <Text
                  style={[styles.typeLabel, { color: theme.textSecondary }]}
                >
                  {TYPE_LABEL[interaction.warningType]}
                </Text>

                <View
                  style={[
                    styles.severityPill,
                    { backgroundColor: accentBackground },
                  ]}
                >
                  <Text style={[styles.severityText, { color: accentColor }]}>
                    {SEVERITY_LABEL[severityKey] ?? interaction.severity}
                  </Text>
                </View>
              </View>

              <Text
                numberOfLines={2}
                style={[styles.message, { color: theme.text }]}
              >
                {interaction.message}
              </Text>
            </View>
          );
        })}
      </View>

      {remainingCount > 0 ? (
        <Text style={[styles.moreText, { color: theme.textSecondary }]}>
          +{remainingCount} more active{" "}
          {remainingCount === 1 ? "interaction" : "interactions"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },

  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: "800",
  },

  subtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },

  countBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    fontSize: 12,
    fontWeight: "700",
  },

  list: {
    gap: Spacing.two,
  },

  interactionRow: {
    borderRadius: 16,
    padding: 14,
  },

  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
    marginBottom: 6,
  },

  typeLabel: {
    fontSize: 11,
    fontWeight: "600",
  },

  severityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  severityText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },

  moreText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: Spacing.two,
  },

  errorContent: {
    flex: 1,
  },

  errorMessage: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
});
