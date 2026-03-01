import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session, EmailOtpType } from "@supabase/supabase-js";
import { fetchMobileTenantData, createTenantTicket } from "../lib/tenant-data";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import type { MobileTenantData, MobileTicketDTO } from "../lib/types";

type ProfileRole = "owner" | "manager" | "tenant";
const WEB_APP_URL =
  process.env.EXPO_PUBLIC_APP_URL ?? "https://rental-properties-platform-web.vercel.app";

const EMPTY_DATA: MobileTenantData = {
  charges: [],
  tickets: [],
  units: [],
  documents: [],
};

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString()}`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseRedirectParams(url: string) {
  const hash = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const combined = [query, hash].filter(Boolean).join("&");
  return new URLSearchParams(combined);
}

async function applyAuthRedirect(url: string) {
  const supabase = getSupabaseClient();
  const params = parseRedirectParams(url);

  const code = params.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return;
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && type) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
  }
}

export default function MobileHome() {
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<MobileTenantData>(EMPTY_DATA);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketPriority, setTicketPriority] = useState<MobileTicketDTO["priority"]>("medium");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const configured = hasSupabaseConfig();

  const outstandingCents = useMemo(
    () => data.charges.reduce((sum, charge) => sum + charge.amountCents, 0),
    [data.charges]
  );

  const pendingDocs = useMemo(
    () => data.documents.filter((document) => document.signerStatus !== "signed").length,
    [data.documents]
  );

  const openTickets = useMemo(
    () =>
      data.tickets.filter(
        (ticket) => ticket.status === "open" || ticket.status === "in_progress"
      ).length,
    [data.tickets]
  );

  useEffect(() => {
    if (!configured) {
      setLoadingSession(false);
      return;
    }

    const supabase = getSupabaseClient();

    let mounted = true;

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes("auth")) {
          await applyAuthRedirect(initialUrl);
        }
      } catch {
        // Ignore malformed deep-link state.
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (mounted) {
        setSession(currentSession);
        setLoadingSession(false);
      }
    };

    void bootstrap();

    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void (async () => {
        try {
          await applyAuthRedirect(url);
          setAuthMessage("Signed in. Loading your workspace.");
        } catch {
          setAuthMessage("Sign-in link opened, but session could not be verified.");
        }
      })();
    });

    return () => {
      mounted = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [configured]);

  useEffect(() => {
    if (!configured || !session?.user?.id) {
      setProfileRole(null);
      setData(EMPTY_DATA);
      return;
    }

    const supabase = getSupabaseClient();

    const load = async () => {
      setLoadingData(true);
      setErrorMessage(null);

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        const role = (profile?.role ?? "tenant") as ProfileRole;
        setProfileRole(role);

        if (role !== "tenant") {
          setData(EMPTY_DATA);
          return;
        }

        const tenantData = await fetchMobileTenantData(session.user.id);
        setData(tenantData);
        setSelectedUnitId((prev) => {
          if (prev && tenantData.units.some((unit) => unit.id === prev)) {
            return prev;
          }

          return tenantData.units[0]?.id ?? "";
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load mobile data.");
      } finally {
        setLoadingData(false);
      }
    };

    void load();
  }, [configured, session?.user?.id]);

  const sendMagicLink = async () => {
    if (!configured) {
      setAuthMessage("Supabase mobile environment is not configured.");
      return;
    }

    if (!email.trim()) {
      setAuthMessage("Enter an email address first.");
      return;
    }

    const supabase = getSupabaseClient();
    const redirectTo = "rentflow://auth/callback";

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage("Magic link sent. Open it on this device to complete mobile sign-in.");
  };

  const signOut = async () => {
    if (!configured) {
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setSession(null);
    setProfileRole(null);
    setData(EMPTY_DATA);
  };

  const refreshData = async () => {
    if (!configured || !session?.user?.id || profileRole !== "tenant") {
      return;
    }

    setLoadingData(true);
    setErrorMessage(null);

    try {
      const tenantData = await fetchMobileTenantData(session.user.id);
      setData(tenantData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to refresh data.");
    } finally {
      setLoadingData(false);
    }
  };

  const submitTicket = async () => {
    if (!configured || !session?.user?.id) {
      setErrorMessage("Sign in first.");
      return;
    }

    if (!selectedUnitId || !ticketTitle.trim() || !ticketDescription.trim()) {
      setErrorMessage("Unit, title, and description are required.");
      return;
    }

    setSubmittingTicket(true);
    setErrorMessage(null);

    try {
      await createTenantTicket({
        userId: session.user.id,
        unitId: selectedUnitId,
        title: ticketTitle.trim(),
        description: ticketDescription.trim(),
        priority: ticketPriority,
      });

      setTicketTitle("");
      setTicketDescription("");
      await refreshData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create ticket.");
    } finally {
      setSubmittingTicket(false);
    }
  };

  const openWebLogin = () => {
    void Linking.openURL(`${WEB_APP_URL}/login`);
  };

  const openTenantPayments = () => {
    void Linking.openURL(`${WEB_APP_URL}/tenant`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>RentFlow Mobile</Text>
        <Text style={styles.subtitle}>Tenant-first workspace with live account data.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.primaryBtn} onPress={sendMagicLink}>
            <Text style={styles.primaryBtnText}>Send Mobile Magic Link</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={openWebLogin}>
            <Text style={styles.secondaryBtnText}>Open Web Login Instead</Text>
          </Pressable>
          {authMessage ? <Text style={styles.infoText}>{authMessage}</Text> : null}
        </View>

        {!configured ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Mobile Environment Missing</Text>
            <Text style={styles.warningText}>
              Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile env.
            </Text>
          </View>
        ) : null}

        {loadingSession ? (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#7c3aed" />
            <Text style={styles.centerText}>Loading session...</Text>
          </View>
        ) : null}

        {session ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Session</Text>
            <Text style={styles.metaText}>{session.user.email}</Text>
            <Pressable style={styles.secondaryBtn} onPress={signOut}>
              <Text style={styles.secondaryBtnText}>Sign Out</Text>
            </Pressable>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {session && profileRole === "tenant" ? (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Outstanding</Text>
                <Text style={styles.kpiValue}>{dollars(outstandingCents)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Open Tickets</Text>
                <Text style={styles.kpiValue}>{openTickets}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Pending Docs</Text>
                <Text style={styles.kpiValue}>{pendingDocs}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Outstanding Charges</Text>
              {data.charges.length === 0 ? (
                <Text style={styles.emptyText}>No pending or late charges.</Text>
              ) : (
                data.charges.map((charge) => (
                  <View key={charge.id} style={styles.inlineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inlineTitle}>{charge.propertyLabel}</Text>
                      <Text style={styles.inlineMeta}>Due {formatDate(charge.dueDate)}</Text>
                    </View>
                    <View style={styles.alignRight}>
                      <Text style={styles.inlineAmount}>{dollars(charge.amountCents)}</Text>
                      <Text style={styles.badgeText}>{charge.status.toUpperCase()}</Text>
                    </View>
                  </View>
                ))
              )}
              <Pressable style={styles.primaryBtn} onPress={openTenantPayments}>
                <Text style={styles.primaryBtnText}>Pay in Web Checkout</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create Maintenance Ticket</Text>
              <Text style={styles.fieldLabel}>Unit</Text>
              <View style={styles.choiceRow}>
                {data.units.map((unit) => {
                  const selected = unit.id === selectedUnitId;
                  return (
                    <Pressable
                      key={unit.id}
                      style={[styles.choicePill, selected && styles.choicePillActive]}
                      onPress={() => setSelectedUnitId(unit.id)}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
                        {unit.propertyName} • {unit.unitNumber}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Issue title"
                value={ticketTitle}
                onChangeText={setTicketTitle}
              />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Describe the issue"
                value={ticketDescription}
                onChangeText={setTicketDescription}
                multiline
              />

              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.choiceRow}>
                {(["low", "medium", "high", "urgent"] as MobileTicketDTO["priority"][]).map((priority) => {
                  const selected = priority === ticketPriority;
                  return (
                    <Pressable
                      key={priority}
                      style={[styles.choicePill, selected && styles.choicePillActive]}
                      onPress={() => setTicketPriority(priority)}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
                        {priority.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.primaryBtn, submittingTicket && styles.primaryBtnDisabled]}
                onPress={submitTicket}
                disabled={submittingTicket}
              >
                <Text style={styles.primaryBtnText}>
                  {submittingTicket ? "Submitting..." : "Submit Ticket"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>My Maintenance Tickets</Text>
              {data.tickets.length === 0 ? (
                <Text style={styles.emptyText}>No tickets yet.</Text>
              ) : (
                data.tickets.map((ticket) => (
                  <View key={ticket.id} style={styles.inlineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inlineTitle}>{ticket.title}</Text>
                      <Text style={styles.inlineMeta}>
                        {ticket.propertyName}
                        {ticket.unitNumber ? ` • Unit ${ticket.unitNumber}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.badgeText}>{ticket.status.toUpperCase()}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Documents</Text>
              {data.documents.length === 0 ? (
                <Text style={styles.emptyText}>No document packets yet.</Text>
              ) : (
                data.documents.map((document) => (
                  <View key={document.id} style={styles.inlineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inlineTitle}>{document.templateName}</Text>
                      <Text style={styles.inlineMeta}>{document.propertyLabel}</Text>
                    </View>
                    <Text style={styles.badgeText}>{document.signerStatus.toUpperCase()}</Text>
                  </View>
                ))
              )}
            </View>

            <Pressable style={styles.secondaryBtn} onPress={refreshData}>
              <Text style={styles.secondaryBtnText}>
                {loadingData ? "Refreshing..." : "Refresh Data"}
              </Text>
            </Pressable>
          </>
        ) : null}

        {session && profileRole && profileRole !== "tenant" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Owner/Manager Snapshot (Read-only)</Text>
            <Text style={styles.metaText}>Mobile V1 is tenant-first.</Text>
            <Text style={styles.metaText}>Use web dashboard for full owner/manager operations.</Text>
          </View>
        ) : null}
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#eef2ff",
  },
  container: {
    padding: 20,
    gap: 14,
    paddingBottom: 42,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 15,
    color: "#4b5563",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 16,
  },
  warningCard: {
    backgroundColor: "#fef3c7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fcd34d",
    padding: 14,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },
  warningText: {
    marginTop: 4,
    color: "#92400e",
    fontSize: 13,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 6,
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#fff",
    fontSize: 14,
  },
  textarea: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#3730a3",
    fontWeight: "700",
    fontSize: 12,
  },
  infoText: {
    marginTop: 8,
    fontSize: 12,
    color: "#4b5563",
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 10,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
  },
  centerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  centerText: {
    color: "#4b5563",
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    color: "#6b7280",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#f8faff",
    padding: 10,
  },
  kpiLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    color: "#6366f1",
  },
  kpiValue: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  inlineRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e0e7ff",
    paddingTop: 8,
  },
  inlineTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  inlineMeta: {
    marginTop: 1,
    color: "#6b7280",
    fontSize: 12,
  },
  inlineAmount: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  alignRight: {
    alignItems: "flex-end",
  },
  badgeText: {
    marginTop: 2,
    color: "#4338ca",
    fontSize: 11,
    fontWeight: "700",
  },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#4b5563",
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  choicePill: {
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  choicePillActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  choiceText: {
    color: "#3730a3",
    fontSize: 11,
    fontWeight: "600",
  },
  choiceTextActive: {
    color: "#ffffff",
  },
});
