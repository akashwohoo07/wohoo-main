import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTrip, exploreSearch } from "../../api/endpoints";
import { Loading, EmptyState } from "../../components/ui";
import { colors } from "../../theme";

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  destination: "location",
  hotel: "bed",
  restaurant: "restaurant",
  activity: "ticket",
  transport: "airplane",
  place: "business",
  shopping: "bag-handle",
  note: "document-text",
  other: "ellipsis-horizontal",
};

const CATEGORIES = [
  { kind: "stays", label: "Stays", icon: "bed" as const },
  { kind: "eats", label: "Eats", icon: "restaurant" as const },
  { kind: "activities", label: "Activities", icon: "ticket" as const },
  { kind: "sights", label: "Sights", icon: "business" as const },
];

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;
}

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [cat, setCat] = useState<string | null>(null);

  const { data: trip, isLoading } = useQuery({ queryKey: ["trip", id], queryFn: () => fetchTrip(id!) });

  const coords = trip?.destination?.coordinates;
  const { data: places = [], isFetching: loadingPlaces } = useQuery({
    queryKey: ["explore", id, cat],
    queryFn: () => exploreSearch({ ll: `${coords!.lat},${coords!.lng}`, kind: cat!, radius: 5000 }),
    enabled: !!cat && !!coords?.lat,
  });

  if (isLoading) return <Loading />;
  if (!trip) return <EmptyState icon="alert-circle-outline" title="Trip not found" />;

  const dest = trip.destination?.fullLabel || trip.destination?.name;
  const dates = [fmt(trip.startDate), fmt(trip.endDate)].filter(Boolean).join(" – ");
  const itinerary = trip.itinerary || [];

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="h-52 w-full bg-zinc-100">
        {trip.coverPhoto ? (
          <Image source={trip.coverPhoto} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center bg-rose-50">
            <Ionicons name="image-outline" size={40} color={colors.rose300} />
          </View>
        )}
      </View>

      <View className="px-5 pt-5">
        <Text className="font-serif text-3xl font-bold text-ink">{trip.name}</Text>
        {dest ? (
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={15} color={colors.zinc400} />
            <Text className="font-sans text-sm text-zinc-500">{dest}</Text>
          </View>
        ) : null}
        {dates ? (
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons name="calendar-outline" size={15} color={colors.zinc400} />
            <Text className="font-sans text-sm text-zinc-500">{dates}</Text>
          </View>
        ) : null}

        {/* Itinerary */}
        <Text className="mb-3 mt-7 font-sans text-xs font-bold uppercase tracking-widest text-zinc-400">
          Itinerary
        </Text>
        {itinerary.length === 0 ? (
          <Text className="font-sans text-sm text-zinc-400">No items yet.</Text>
        ) : (
          itinerary.map((item: any, i: number) => (
            <View key={item._id || i} className="mb-2 flex-row items-center gap-3 rounded-2xl bg-white p-3">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
                <Ionicons name={TYPE_ICON[item.type] || "ellipsis-horizontal"} size={18} color={colors.rose} />
              </View>
              <View className="flex-1">
                <Text className="font-sans text-[15px] font-medium text-ink" numberOfLines={1}>
                  {item.title ||
                    (item.fromStation && item.toStation ? `${item.fromStation} → ${item.toStation}` : item.type)}
                </Text>
                {item.region ? (
                  <Text className="font-sans text-[12px] text-zinc-400" numberOfLines={1}>
                    {item.region}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        {/* Explore nearby */}
        {coords?.lat ? (
          <>
            <Text className="mb-3 mt-7 font-sans text-xs font-bold uppercase tracking-widest text-zinc-400">
              Explore nearby
            </Text>
            <View className="flex-row gap-2">
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.kind}
                  onPress={() => setCat((prev) => (prev === c.kind ? null : c.kind))}
                  className={`flex-1 items-center gap-1 rounded-2xl border p-3 ${
                    cat === c.kind ? "border-rose-300 bg-rose-50" : "border-ink/10 bg-white"
                  }`}
                >
                  <Ionicons name={c.icon} size={20} color={cat === c.kind ? colors.rose : colors.zinc500} />
                  <Text className="font-sans text-[11px] font-semibold text-zinc-600">{c.label}</Text>
                </Pressable>
              ))}
            </View>

            {cat ? (
              loadingPlaces ? (
                <View className="py-8">
                  <Loading />
                </View>
              ) : (
                <View className="mt-3">
                  {places.slice(0, 10).map((p) => (
                    <View key={p.id} className="mb-2 flex-row items-center gap-3 rounded-2xl bg-white p-2">
                      <View className="h-14 w-14 overflow-hidden rounded-xl bg-zinc-100">
                        {p.photo ? (
                          <Image source={p.photo} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                        ) : (
                          <View className="h-full w-full items-center justify-center">
                            <Ionicons name="location-outline" size={20} color={colors.zinc400} />
                          </View>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-sans text-[14px] font-semibold text-ink" numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.rating ? (
                          <Text className="font-sans text-[12px] text-zinc-500">★ {p.rating}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
