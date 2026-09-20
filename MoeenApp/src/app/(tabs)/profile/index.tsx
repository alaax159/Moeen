import { Ionicons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { logoutUser } from "@/firebase/auth";
import { useTheme } from "@/hooks/use-theme";

import { EmergencyHelpButton } from "@/features/emergency-support/EmergencyHelpButton";
import { AllergyCard } from "@/features/health-profile/AllergyCard";
import {
    deleteAllergy,
    deleteChronicCondition,
    getHealthProfile,
    HealthProfileApiError,
} from "@/features/health-profile/api";
import { ConditionCard } from "@/features/health-profile/ConditionCard";
import { ConfirmDeleteModal } from "@/features/health-profile/ConfirmDeleteModal";
import { EmergencyInfoCard } from "@/features/health-profile/EmergencyInfoCard";
import { PersonalInfoCard } from "@/features/health-profile/PersonalInfoCard";
import { SectionHeader } from "@/features/health-profile/SectionHeader";
import type { HealthProfile } from "@/features/health-profile/types";
import { getCriticalAllergy } from "@/features/health-profile/utils";

export default function HealthProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "allergy" | "condition"; id: number; name: string } | null
  >(null);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getHealthProfile();
      setProfile(response);
    } catch (err) {
      const message =
        err instanceof HealthProfileApiError
          ? err.message
          : "Something went wrong loading your health profile.";

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const criticalAllergy = useMemo(
    () => (profile ? getCriticalAllergy(profile.allergies) : null),
    [profile],
  );

  const handleCancelDelete = () => {
    setPendingDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    const { kind, id } = pendingDelete;
    setPendingDelete(null);

    try {
      if (kind === "allergy") {
        await deleteAllergy(id);
      } else {
        await deleteChronicCondition(id);
      }
      loadProfile();
    } catch (err) {
      Alert.alert(
        kind === "allergy"
          ? "Unable to delete allergy"
          : "Unable to delete condition",
        err instanceof HealthProfileApiError ? err.message : "Please try again.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      Alert.alert("Unable to log out", "Please try again.");
    }
  };

  return (
    <ThemedView
      style={[styles.screen, { backgroundColor: theme.backgroundElement }]}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.text }]}>
                Health Profile
              </Text>

              {profile && (
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {profile.personalInfo.firstName}{" "}
                  {profile.personalInfo.lastName}
                </Text>
              )}
            </View>

            <View style={styles.headerActions}>
              <View
                style={[styles.avatar, { backgroundColor: theme.primaryLight }]}
              >
                <Ionicons name="person" size={22} color={theme.primary} />
              </View>

              <Pressable
                onPress={handleLogout}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Log out"
              >
                <Ionicons
                  name="log-out-outline"
                  size={24}
                  color={theme.danger}
                />
              </Pressable>
            </View>
          </View>

          <EmergencyHelpButton style={styles.emergencyHelp} />

          {isLoading && (
            <ActivityIndicator
              style={styles.loading}
              color={theme.primary}
              size="large"
            />
          )}

          {!isLoading && error && (
            <Text style={[styles.errorText, { color: theme.danger }]}>
              {error}
            </Text>
          )}

          {!isLoading && !error && profile && (
            <>
              <EmergencyInfoCard
                criticalAllergy={criticalAllergy}
                personalInfo={profile.personalInfo}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Emergency Medical Card"
                onPress={() =>
                  router.push("/profile/emergency-support" as Href)
                }
                style={[
                  styles.emergencyCardLink,
                  { backgroundColor: theme.background },
                ]}
              >
                <View
                  style={[
                    styles.emergencyCardIcon,
                    { backgroundColor: theme.dangerLight },
                  ]}
                >
                  <Ionicons name="medical" size={22} color={theme.danger} />
                </View>
                <View style={styles.emergencyCardText}>
                  <Text
                    style={[styles.emergencyCardTitle, { color: theme.text }]}
                  >
                    Emergency Medical Card
                  </Text>
                  <Text
                    style={[
                      styles.emergencyCardSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Preview the medical information available in an emergency.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage emergency contacts"
                onPress={() =>
                  router.push("/profile/emergency-contacts" as Href)
                }
                style={[
                  styles.emergencyCardLink,
                  { backgroundColor: theme.background },
                ]}
              >
                <View
                  style={[
                    styles.emergencyCardIcon,
                    { backgroundColor: theme.primaryLight },
                  ]}
                >
                  <Ionicons name="people" size={22} color={theme.primary} />
                </View>
                <View style={styles.emergencyCardText}>
                  <Text
                    style={[styles.emergencyCardTitle, { color: theme.text }]}
                  >
                    Emergency Contacts
                  </Text>
                  <Text
                    style={[
                      styles.emergencyCardSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Add, edit, and choose who is contacted in an emergency.
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>

              <View style={styles.section}>
                <PersonalInfoCard
                  personalInfo={profile.personalInfo}
                  onEdit={() => router.push("/profile/personal-info")}
                />
              </View>

              <SectionHeader
                title="Allergies"
                onAdd={() => router.push("/profile/allergy-add")}
              />

              <View style={styles.cardList}>
                {profile.allergies.length === 0 ? (
                  <Text
                    style={[styles.emptyText, { color: theme.textSecondary }]}
                  >
                    No allergies on file.
                  </Text>
                ) : (
                  profile.allergies.map((allergy) => (
                    <AllergyCard
                      key={allergy.id}
                      allergy={allergy}
                      onDelete={() =>
                        setPendingDelete({
                          kind: "allergy",
                          id: allergy.id,
                          name: allergy.name,
                        })
                      }
                    />
                  ))
                )}
              </View>

              <SectionHeader
                title="Chronic Conditions"
                onAdd={() => router.push("/profile/condition-add")}
              />

              <View style={styles.cardList}>
                {profile.chronicConditions.length === 0 ? (
                  <Text
                    style={[styles.emptyText, { color: theme.textSecondary }]}
                  >
                    No chronic conditions on file.
                  </Text>
                ) : (
                  profile.chronicConditions.map((condition) => (
                    <ConditionCard
                      key={condition.id}
                      condition={condition}
                      onDelete={() =>
                        setPendingDelete({
                          kind: "condition",
                          id: condition.id,
                          name: condition.name,
                        })
                      }
                    />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDeleteModal
        visible={pendingDelete !== null}
        title={pendingDelete?.kind === "allergy" ? "Delete allergy?" : "Delete condition?"}
        message={
          pendingDelete
            ? `Remove ${pendingDelete.name} from your ${
                pendingDelete.kind === "allergy" ? "allergies" : "chronic conditions"
              }.`
            : ""
        }
        onCancel={handleCancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 124,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.4,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  loading: {
    marginTop: Spacing.six,
  },

  errorText: {
    textAlign: "center",
    marginTop: Spacing.four,
    fontSize: 14,
  },

  section: {
    marginTop: 18,
  },

  emergencyHelp: {
    marginBottom: Spacing.three,
  },

  emergencyCardLink: {
    alignItems: "center",
    borderRadius: 20,
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    padding: 14,
  },

  emergencyCardIcon: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },

  emergencyCardText: {
    flex: 1,
  },

  emergencyCardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },

  emergencyCardSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  cardList: {
    gap: Spacing.two,
  },

  emptyText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: Spacing.three,
  },
});
