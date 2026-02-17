import { StatusBar } from "expo-status-bar";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

const cards = [
  { title: "Collected This Month", value: "$4,050", note: "2 payments posted" },
  { title: "Open Tickets", value: "2", note: "1 urgent" },
  { title: "Lease Renewals", value: "1", note: "Due in 30 days" }
];

export default function MobileHome() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Rental Manager</Text>
        <Text style={styles.subtitle}>Owner + tenant workflows in one app.</Text>

        {cards.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardValue}>{card.value}</Text>
            <Text style={styles.cardNote}>{card.note}</Text>
          </View>
        ))}
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
    gap: 14
  },
  title: {
    fontSize: 32,
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
  }
});
