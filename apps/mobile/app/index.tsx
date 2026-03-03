import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

type AppRole = "tenant" | "owner";

export default function MobileHome() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("tenant");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDetail, setTicketDetail] = useState("");
  const [tickets, setTickets] = useState([
    { id: "1", title: "Kitchen faucet leak", status: "open" },
    { id: "2", title: "Hallway light out", status: "in_progress" }
  ]);
  const [docs, setDocs] = useState([
    { id: "d1", title: "Lease Addendum", status: "pending" as "pending" | "signed" },
    { id: "d2", title: "Pet Policy", status: "signed" as "pending" | "signed" }
  ]);

  const openWebLogin = () => {
    void Linking.openURL("https://rental-properties-platform-web.vercel.app/login");
  };

  const payNow = () => {
    void Linking.openURL("https://rental-properties-platform-web.vercel.app/tenant");
  };

  const submitTicket = () => {
    if (!ticketTitle.trim()) return;
    setTickets((prev) => [
      { id: `${Date.now()}`, title: ticketTitle.trim(), status: "open" },
      ...prev
    ]);
    setTicketTitle("");
    setTicketDetail("");
  };

  const pendingCount = useMemo(
    () => docs.filter((doc) => doc.status === "pending").length,
    [docs]
  );

  const signDoc = (id: string) => {
    setDocs((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, status: "signed" } : doc))
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>RentFlow Mobile</Text>
        <Text style={styles.subtitle}>Tenant-first V1 workflow companion.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Auth Gateway</Text>
          <TextInput
            style={styles.input}
            placeholder="Email address"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Pressable style={styles.primaryBtn} onPress={openWebLogin}>
            <Text style={styles.primaryBtnText}>Continue in Web Login</Text>
          </Pressable>
        </View>

        <View style={styles.roleRow}>
          <Pressable
            style={[styles.rolePill, role === "tenant" && styles.rolePillActive]}
            onPress={() => setRole("tenant")}
          >
            <Text style={[styles.rolePillText, role === "tenant" && styles.rolePillTextActive]}>
              Tenant
            </Text>
          </Pressable>
          <Pressable
            style={[styles.rolePill, role === "owner" && styles.rolePillActive]}
            onPress={() => setRole("owner")}
          >
            <Text style={[styles.rolePillText, role === "owner" && styles.rolePillTextActive]}>
              Owner
            </Text>
          </Pressable>
        </View>

        {role === "tenant" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Outstanding Charges</Text>
              <Text style={styles.cardValue}>$1,350</Text>
              <Text style={styles.cardNote}>Due Mar 1, 2026 • 1 late charge</Text>
              <Pressable style={styles.primaryBtn} onPress={payNow}>
                <Text style={styles.primaryBtnText}>Pay Now (Web Checkout)</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Maintenance Requests</Text>
              <TextInput
                style={styles.input}
                placeholder="Issue title"
                value={ticketTitle}
                onChangeText={setTicketTitle}
              />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Describe the issue"
                value={ticketDetail}
                onChangeText={setTicketDetail}
                multiline
              />
              <Pressable style={styles.primaryBtn} onPress={submitTicket}>
                <Text style={styles.primaryBtnText}>Submit Ticket</Text>
              </Pressable>
              {tickets.map((ticket) => (
                <View key={ticket.id} style={styles.inlineRow}>
                  <Text style={styles.inlineTitle}>{ticket.title}</Text>
                  <Text style={styles.inlineBadge}>{ticket.status.toUpperCase()}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Documents</Text>
              <Text style={styles.cardNote}>{pendingCount} awaiting signature</Text>
              {docs.map((doc) => (
                <View key={doc.id} style={styles.inlineRow}>
                  <Text style={styles.inlineTitle}>{doc.title}</Text>
                  {doc.status === "pending" ? (
                    <Pressable style={styles.secondaryBtn} onPress={() => signDoc(doc.id)}>
                      <Text style={styles.secondaryBtnText}>Sign</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.inlineBadge}>SIGNED</Text>
                  )}
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Owner Snapshot (Read-only)</Text>
            <Text style={styles.cardValue}>$4,050 collected</Text>
            <Text style={styles.cardNote}>2 open tickets • 1 pending signature</Text>
            <Text style={styles.cardNote}>Use web dashboard for full operations controls.</Text>
          </View>
        )}
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f3efe8"
  },
  container: {
    padding: 20,
    gap: 14,
    paddingBottom: 36
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#1f2328"
  },
  subtitle: {
    fontSize: 16,
    color: "#5f6b76",
    marginBottom: 12
  },
  card: {
    backgroundColor: "#fffbf4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9d0bf",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  roleRow: {
    flexDirection: "row",
    gap: 10
  },
  rolePill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9d0bf",
    backgroundColor: "#fffbf4",
    paddingVertical: 8,
    alignItems: "center"
  },
  rolePillActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e"
  },
  rolePillText: {
    fontSize: 12,
    color: "#1f2328",
    fontWeight: "600"
  },
  rolePillTextActive: {
    color: "#fff"
  },
  cardTitle: {
    fontSize: 14,
    color: "#5f6b76"
  },
  cardValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: "700",
    color: "#0f766e"
  },
  cardNote: {
    marginTop: 4,
    color: "#1f2328"
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d9d0bf",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
    fontSize: 14
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: "top"
  },
  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#d9d0bf",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  secondaryBtnText: {
    color: "#1f2328",
    fontWeight: "600",
    fontSize: 12
  },
  inlineRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#ebe3d3",
    paddingTop: 8
  },
  inlineTitle: {
    color: "#1f2328",
    fontSize: 13,
    fontWeight: "600"
  },
  inlineBadge: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "700"
  }
});
