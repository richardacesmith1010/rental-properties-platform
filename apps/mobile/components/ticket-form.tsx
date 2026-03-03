import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileTenantUnitDTO, MobileTicketDTO } from "../lib/types";
import { borderRadius, colors, fontSize, spacing } from "../lib/theme";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

interface TicketFormProps {
  units: MobileTenantUnitDTO[];
  submitting?: boolean;
  onSubmit: (payload: {
    unitId: string;
    title: string;
    description: string;
    priority: MobileTicketDTO["priority"];
  }) => Promise<void> | void;
}

const priorities: MobileTicketDTO["priority"][] = ["low", "medium", "high", "urgent"];

export function TicketForm({ units, onSubmit, submitting = false }: TicketFormProps) {
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MobileTicketDTO["priority"]>("medium");
  const [error, setError] = useState<string | null>(null);

  const unitOptions = useMemo(
    () => units.map((unit) => ({ value: unit.id, label: `${unit.propertyName} • ${unit.unitNumber}` })),
    [units]
  );

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
  };

  const handleSubmit = async () => {
    if (!unitId) {
      setError("Select the unit before submitting.");
      return;
    }

    if (!title.trim()) {
      setError("Add a short issue title.");
      return;
    }

    if (!description.trim()) {
      setError("Describe the issue.");
      return;
    }

    setError(null);
    await onSubmit({
      unitId,
      title: title.trim(),
      description: description.trim(),
      priority,
    });
    reset();
  };

  return (
    <Card>
      <Text style={styles.heading}>Create Maintenance Ticket</Text>

      <Text style={styles.label}>Unit</Text>
      <View style={styles.rowWrap}>
        {unitOptions.map((unit) => {
          const selected = unit.value === unitId;
          return (
            <Pressable
              key={unit.value}
              onPress={() => setUnitId(unit.value)}
              style={[styles.pill, selected ? styles.pillActive : null]}
            >
              <Text style={[styles.pillText, selected ? styles.pillTextActive : null]}>{unit.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Input label="Issue title" onChangeText={setTitle} value={title} />
      <Input
        label="Description"
        multiline
        numberOfLines={4}
        onChangeText={setDescription}
        style={styles.textarea}
        textAlignVertical="top"
        value={description}
      />

      <Text style={styles.label}>Priority</Text>
      <View style={styles.rowWrap}>
        {priorities.map((item) => {
          const selected = item === priority;
          return (
            <Pressable
              key={item}
              onPress={() => setPriority(item)}
              style={[styles.pill, selected ? styles.pillActive : null]}
            >
              <Text style={[styles.pillText, selected ? styles.pillTextActive : null]}>
                {item.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button disabled={submitting} onPress={() => void handleSubmit()}>
        {submitting ? "Submitting..." : "Submit Ticket"}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: "600",
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  pill: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  pillTextActive: {
    color: colors.primaryText,
  },
  textarea: {
    minHeight: 96,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
});
