import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors } from "../theme";
import type { Trip } from "../api/types";

function fmt(d?: string) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

const STATUS_STYLE: Record<string, string> = {
  upcoming: "bg-rose-100 text-rose-600",
  ongoing: "bg-emerald-100 text-emerald-700",
  past: "bg-zinc-200 text-zinc-600",
};

export function TripCard({ trip }: { trip: Trip }) {
  const router = useRouter();
  const dest = trip.destination?.fullLabel || trip.destination?.name;
  const dates = [fmt(trip.startDate), fmt(trip.endDate)].filter(Boolean).join(" – ");
  const statusCls = STATUS_STYLE[trip.status || "upcoming"] || STATUS_STYLE.upcoming;

  return (
    <Pressable
      onPress={() => router.push(`/trip/${trip._id}`)}
      className="mb-4 overflow-hidden rounded-3xl border border-ink/5 bg-white active:opacity-90"
    >
      <View className="h-40 w-full bg-zinc-100">
        {trip.coverPhoto ? (
          <Image source={trip.coverPhoto} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
        ) : (
          <View className="h-full w-full items-center justify-center bg-rose-50">
            <Ionicons name="image-outline" size={32} color={colors.rose300} />
          </View>
        )}
        {trip.status ? (
          <View className={`absolute right-3 top-3 rounded-full px-2.5 py-1 ${statusCls}`}>
            <Text className={`font-sans text-[11px] font-bold capitalize ${statusCls}`}>{trip.status}</Text>
          </View>
        ) : null}
      </View>
      <View className="p-4">
        <Text className="font-serif text-xl font-bold text-ink" numberOfLines={1}>
          {trip.name}
        </Text>
        {dest ? (
          <View className="mt-1 flex-row items-center gap-1">
            <Ionicons name="location-outline" size={13} color={colors.zinc400} />
            <Text className="font-sans text-[13px] text-zinc-500" numberOfLines={1}>
              {dest}
            </Text>
          </View>
        ) : null}
        {dates ? (
          <View className="mt-0.5 flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={13} color={colors.zinc400} />
            <Text className="font-sans text-[13px] text-zinc-500">{dates}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
