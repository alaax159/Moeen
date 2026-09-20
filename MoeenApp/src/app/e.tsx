import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";
import {
  EMERGENCY_INFORMATION_CONFIGURATION,
  EMERGENCY_INFORMATION_RETRY,
  EMERGENCY_INFORMATION_UNAVAILABLE,
  PublicEmergencyCardError,
  consumeEmergencyTokenFragment,
  fetchPublicEmergencyCard,
} from "@/features/emergency-support/public-responder";
import type {
  EmergencyCardMedication,
  EmergencyMedicalCard,
} from "@/features/emergency-support/types";
import { formatFrequency, formatTime } from "@/features/medications/list/utils";
import { useTheme } from "@/hooks/use-theme";

type PageState =
  | "configuration"
  | "loading"
  | "ready"
  | "unavailable"
  | "retry";

function displayDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString();
}

function displayUpdated(value: string | null): string {
  if (!value) return "Update time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Update time unavailable"
    : `Last updated ${date.toLocaleString()}`;
}

function medicationName(medication: EmergencyCardMedication): string {
  return medication.name ?? medication.normalizedName ?? "Medication";
}

export default function PublicEmergencyCardScreen() {
  const theme = useTheme();
  const tokenRef = useRef<string | null>(null);
  const consumedFragment = useRef(false);
  const [state, setState] = useState<PageState>("loading");
  const [card, setCard] = useState<EmergencyMedicalCard | null>(null);

  const loadCard = useCallback(async (token: string) => {
    setState("loading");
    setCard(null);
    try {
      setCard(await fetchPublicEmergencyCard(token));
      setState("ready");
    } catch (error) {
      setState(
        error instanceof PublicEmergencyCardError
          ? error.kind
          : "retry",
      );
    }
  }, []);

  useEffect(() => {
    if (consumedFragment.current) return;
    consumedFragment.current = true;

    if (typeof window === "undefined") return;
    const token = consumeEmergencyTokenFragment(
      window.location,
      window.history,
    );
    tokenRef.current = token;
    if (!token) {
      void Promise.resolve().then(() => setState("unavailable"));
      return;
    }

    void Promise.resolve().then(() => loadCard(token));
    return () => {
      tokenRef.current = null;
    };
  }, [loadCard]);

  const retry = useCallback(() => {
    if (tokenRef.current) void loadCard(tokenRef.current);
  }, [loadCard]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.backgroundElement }]}>
      <Head>
        <title>Moeen Emergency Medical Card</title>
        <meta name="referrer" content="no-referrer" />
      </Head>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <Text style={styles.brand}>Moeen Medical Info</Text>
          <Text style={styles.headerText}>Read-only emergency information</Text>
        </View>

        {state === "loading" ? (
          <StatusPanel title="Loading emergency information">
            <ActivityIndicator color={theme.primary} />
          </StatusPanel>
        ) : state === "configuration" ? (
          <StatusPanel title={EMERGENCY_INFORMATION_CONFIGURATION} />
        ) : state === "unavailable" ? (
          <StatusPanel title={EMERGENCY_INFORMATION_UNAVAILABLE} />
        ) : state === "retry" ? (
          <StatusPanel title={EMERGENCY_INFORMATION_RETRY}>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={[styles.button, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </StatusPanel>
        ) : card ? (
          <EmergencyCard card={card} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function EmergencyCard({ card }: { card: EmergencyMedicalCard }) {
  const theme = useTheme();
  const fullName = [card.patient.firstName, card.patient.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <View style={styles.cards}>
      <View style={[styles.patientCard, { backgroundColor: theme.background }]}>
        <View style={styles.patientDetails}>
          <Text style={[styles.patientName, { color: theme.text }]}>
            {fullName || "Patient name unavailable"}
          </Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>
            Date of birth: {displayDate(card.patient.dateOfBirth)}
          </Text>
          <Text style={[styles.muted, { color: theme.textSecondary }]}>
            Gender: {card.patient.gender ?? "Not available"}
          </Text>
          <Text style={[styles.updated, { color: theme.textSecondary }]}>
            {displayUpdated(card.lastUpdated)}
          </Text>
        </View>
        <View
          style={[styles.bloodBadge, { backgroundColor: theme.dangerLight }]}
        >
          <Text style={[styles.bloodLabel, { color: theme.danger }]}>
            BLOOD
          </Text>
          <Text style={[styles.bloodType, { color: theme.danger }]}>
            {card.patient.bloodType ?? "—"}
          </Text>
        </View>
      </View>

      <Section title="Allergies" count={card.allergies.length}>
        {card.allergies.length ? (
          card.allergies.map((allergy, index) => (
            <Item key={`${allergy.name}-${index}`} title={allergy.name}>
              {[allergy.severity, allergy.reaction]
                .filter(Boolean)
                .join(" · ") || "Details unavailable"}
            </Item>
          ))
        ) : (
          <Empty>No allergies listed</Empty>
        )}
      </Section>

      <Section title="Chronic conditions" count={card.chronicConditions.length}>
        {card.chronicConditions.length ? (
          card.chronicConditions.map((condition, index) => (
            <Item key={`${condition.name}-${index}`} title={condition.name} />
          ))
        ) : (
          <Empty>No chronic conditions listed</Empty>
        )}
      </Section>

      <Section title="Medications" count={card.medications.length}>
        {card.medications.length ? (
          card.medications.map((medication, index) => (
            <Item
              key={`${medicationName(medication)}-${index}`}
              title={medicationName(medication)}
            >
              {`${medication.dose} ${medication.unit} · ${formatFrequency(medication.frequency)}`}
              {medication.times.length
                ? ` · ${medication.times.map(formatTime).join(", ")}`
                : ""}
              {medication.instructions ? ` · ${medication.instructions}` : ""}
            </Item>
          ))
        ) : (
          <Empty>No current medications listed</Empty>
        )}
      </Section>

      <Section title="Emergency contacts" count={card.emergencyContacts.length}>
        {card.emergencyContacts.length ? (
          card.emergencyContacts.map((contact, index) => (
            <Item
              key={`${contact.phone}-${index}`}
              title={contact.name ?? "Emergency contact"}
            >
              {contact.phone}
            </Item>
          ))
        ) : (
          <Empty>No emergency contacts listed</Empty>
        )}
      </Section>
    </View>
  );
}

function StatusPanel({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.statusPanel, { backgroundColor: theme.background }]}>
      <Text style={[styles.statusTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Section({
  children,
  count,
  title,
}: {
  children: React.ReactNode;
  count: number;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.count, { color: theme.textSecondary }]}>
          {count}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Item({
  children,
  title,
}: {
  children?: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.item, { borderTopColor: theme.backgroundElement }]}>
      <Text style={[styles.itemTitle, { color: theme.text }]}>{title}</Text>
      {children ? (
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[styles.empty, { color: theme.textSecondary }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: {
    alignSelf: "center",
    maxWidth: MaxContentWidth,
    minHeight: "100%",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
    width: "100%",
  },
  header: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: "#173E2A",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  brand: {
    color: Colors.light.onPrimary,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerText: {
    color: Colors.light.onPrimary,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.88,
  },
  cards: { width: "100%" },
  patientCard: {
    borderRadius: 22,
    flexDirection: "row",
    gap: Spacing.three,
    justifyContent: "space-between",
    marginTop: 14,
    padding: 18,
    shadowColor: "#173E2A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  patientDetails: { flex: 1 },
  patientName: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  muted: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  updated: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  bloodBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    minWidth: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bloodLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  bloodType: { fontSize: 19, fontWeight: "800", marginTop: 1 },
  card: {
    borderRadius: 22,
    marginTop: 14,
    padding: 18,
    shadowColor: "#173E2A",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 2,
  },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800" },
  count: { fontSize: 12, fontWeight: "700" },
  item: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
  },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  empty: { fontSize: 13, lineHeight: 19, paddingTop: 12 },
  statusPanel: {
    alignItems: "center",
    borderRadius: 22,
    gap: 14,
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: "#173E2A",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statusTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  button: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: "center",
  },
  buttonText: {
    color: Colors.light.onPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
});
