import { useEffect, useState } from "react";
import { Text, View, TextInput, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { searchUsers } from "../../api/endpoints";
import { Screen, Avatar, EmptyState, Loading } from "../../components/ui";
import { colors } from "../../theme";

export default function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ["userSearch", debounced],
    queryFn: () => searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  return (
    <Screen>
      <View className="px-5 pb-2 pt-2">
        <Text className="mb-3 font-serif text-3xl font-bold text-ink">Find people</Text>
        <View className="flex-row items-center gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-3">
          <Ionicons name="search" size={18} color={colors.zinc400} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or @username"
            placeholderTextColor={colors.zinc400}
            autoCapitalize="none"
            className="flex-1 font-sans text-[15px] text-ink"
          />
        </View>
      </View>

      {debounced.length < 2 ? (
        <EmptyState icon="people-outline" title="Discover travelers" subtitle="Search to follow friends and see their trips." />
      ) : isFetching ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState icon="person-outline" title="No matches" subtitle={`No one found for “${debounced}”.`} />
      ) : (
        <FlashList
          data={users}
          keyExtractor={(u) => u._id}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => item.username && router.push(`/u/${item.username}`)}
              className="mb-2 flex-row items-center gap-3 rounded-2xl bg-white p-3 active:opacity-80"
            >
              <Avatar uri={item.avatar} name={item.name} size={44} />
              <View className="flex-1">
                <Text className="font-sans text-[15px] font-semibold text-ink">{item.name}</Text>
                {item.username ? <Text className="font-sans text-[13px] text-zinc-500">@{item.username}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.zinc400} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
