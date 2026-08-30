import { useMemo } from "react";
import { Text, View, Pressable, RefreshControl } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchTrips } from "../../api/endpoints";
import { TripCard } from "../../components/TripCard";
import { Screen, Loading, EmptyState } from "../../components/ui";
import { colors } from "../../theme";
import type { Trip } from "../../api/types";

type Row = { type: "header"; label: string } | { type: "trip"; trip: Trip };

export default function TripsScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["trips"],
    queryFn: fetchTrips,
  });

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (data?.upcoming?.length) {
      out.push({ type: "header", label: "Upcoming" });
      data.upcoming.forEach((trip) => out.push({ type: "trip", trip }));
    }
    if (data?.past?.length) {
      out.push({ type: "header", label: "Past" });
      data.past.forEach((trip) => out.push({ type: "trip", trip }));
    }
    return out;
  }, [data]);

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <View className="flex-row items-baseline">
          <Text className="font-serif text-3xl font-bold text-rose-500">Wohoo</Text>
          <Text className="font-serif text-3xl font-bold text-ink">.in</Text>
        </View>
        <Pressable
          onPress={() => router.push("/trip/create")}
          className="h-11 w-11 items-center justify-center rounded-full bg-rose-500 active:opacity-80"
        >
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="airplane-outline"
          title="No trips yet"
          subtitle="Tap the + to plan your first adventure."
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item, i) => (item.type === "trip" ? item.trip._id : `h-${item.label}-${i}`)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.rose} />
          }
          renderItem={({ item }) =>
            item.type === "header" ? (
              <Text className="mb-3 mt-2 font-sans text-xs font-bold uppercase tracking-widest text-zinc-400">
                {item.label}
              </Text>
            ) : (
              <TripCard trip={item.trip} />
            )
          }
        />
      )}
    </Screen>
  );
}
