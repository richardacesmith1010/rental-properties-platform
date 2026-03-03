import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
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
    photoUri: string | null;
  }) => Promise<void> | void;
}

const priorities: MobileTicketDTO["priority"][] = ["low", "medium", "high", "urgent"];

export function TicketForm({ units, onSubmit, submitting = false }: TicketFormProps) {
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MobileTicketDTO["priority"]>("medium");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unitOptions = useMemo(
    () => units.map((unit) => ({ value: unit.id, label: `${unit.propertyName} • ${unit.unitNumber}` })),
    [units]
  );

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setPhotoUri(null);
  };

  const chooseFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to attach a photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0]?.uri ?? null);
      setError(null);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to capture a photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0]?.uri ?? null);
      setError(null);
    }
  };

  const handleAttachPhoto = () => {
    Alert.alert("Attach Photo", "Choose a source for the maintenance photo.", [
      { text: "Take Photo", onPress: () => void takePhoto() },
      { text: "Choose from Library", onPress: () => void chooseFromLibrary() },
      { text: "Cancel", style: "cancel" },
    ]);
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
      photoUri,
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

      <View style={styles.photoWrap}>
        <Button onPress={handleAttachPhoto} variant="secondary">
          {photoUri ? "Change Photo" : "Attach Photo"}
        </Button>
        {photoUri ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <Button onPress={() => setPhotoUri(null)} variant="destructive">
              Remove Photo
            </Button>
          </View>
        ) : null}
      </View>

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
  photoWrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoPreviewWrap: {
    gap: spacing.sm,
  },
  photoPreview: {
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    height: 160,
    width: "100%",
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
});
