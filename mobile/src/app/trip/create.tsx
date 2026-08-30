import { useState } from "react";
import { Text, View, TextInput, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTrip } from "../../api/endpoints";
import { Button } from "../../components/ui";
import { colors } from "../../theme";

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View className="mb-5">
      <Text className="mb-1.5 font-sans text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</Text>
      <TextInput
        placeholderTextColor={colors.zinc400}
        className="rounded-2xl border border-ink/10 bg-white px-4 py-3.5 font-sans text-[15px] text-ink"
        {...props}
      />
    </View>
  );
}

export default function CreateTrip() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      createTrip({
        name: name.trim(),
        destination: destination.trim() ? { name: destination.trim() } : undefined,
        startDate: startDate.trim() || undefined,
        endDate: endDate.trim() || undefined,
      }),
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      router.replace(`/trip/${trip._id}`);
    },
    onError: (e: any) => Alert.alert("Couldn't create trip", e?.response?.data?.message || "Please try again."),
  });

  const submit = () => {
    if (!name.trim()) return Alert.alert("Name required", "Give your trip a name.");
    mutate();
  };

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Field label="Trip name" value={name} onChangeText={setName} placeholder="e.g. Goa with friends" autoFocus />
      <Field label="Destination" value={destination} onChangeText={setDestination} placeholder="e.g. Goa, India" />
      <Field label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
      <Field label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
      <Button label="Create trip" icon="sparkles" onPress={submit} loading={isPending} />
    </ScrollView>
  );
}
