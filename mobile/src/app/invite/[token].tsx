import { Text, View, Alert } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchInvitation, respondInvitation } from "../../api/endpoints";
import { Button, Loading, EmptyState, Screen } from "../../components/ui";
import { colors } from "../../theme";

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => fetchInvitation(token!),
    retry: false,
  });

  const respond = useMutation({
    mutationFn: (action: "accept" | "decline") => respondInvitation(token!, action),
    onSuccess: (res, action) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      if (action === "accept" && res.tripId) router.replace(`/trip/${res.tripId}`);
      else router.replace("/");
    },
    onError: (e: any) => Alert.alert("Couldn't respond", e?.response?.data?.message || "This invite may have expired."),
  });

  if (isLoading) return <Loading />;
  if (isError || !invite)
    return (
      <Screen>
        <EmptyState icon="mail-open-outline" title="Invite unavailable" subtitle="It may have expired or already been used." />
      </Screen>
    );

  const trip = invite.trip;
  const dest = trip?.destination?.fullLabel || trip?.destination?.name;

  return (
    <Screen edges={["bottom"]}>
      <View className="flex-1 px-6 pt-4">
        <View className="overflow-hidden rounded-3xl border border-ink/5 bg-white">
          <View className="h-40 w-full bg-zinc-100">
            {trip?.coverPhoto ? (
              <Image source={trip.coverPhoto} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <View className="h-full w-full items-center justify-center bg-rose-50">
                <Ionicons name="airplane" size={34} color={colors.rose300} />
              </View>
            )}
          </View>
          <View className="p-5">
            <Text className="font-sans text-xs uppercase tracking-widest text-zinc-400">
              {invite.invitedBy?.name ? `${invite.invitedBy.name} invited you` : "You're invited"}
            </Text>
            <Text className="mt-1 font-serif text-2xl font-bold text-ink">{trip?.name || "A trip"}</Text>
            {dest ? <Text className="mt-1 font-sans text-sm text-zinc-500">{dest}</Text> : null}
            <View className="mt-3 self-start rounded-full bg-zinc-100 px-3 py-1">
              <Text className="font-sans text-xs font-semibold capitalize text-zinc-600">Role: {invite.role}</Text>
            </View>
          </View>
        </View>

        <View className="mt-auto mb-6 gap-3">
          <Button label="Accept invite" icon="checkmark" loading={respond.isPending} onPress={() => respond.mutate("accept")} />
          <Button label="Decline" variant="outline" onPress={() => respond.mutate("decline")} />
        </View>
      </View>
    </Screen>
  );
}
