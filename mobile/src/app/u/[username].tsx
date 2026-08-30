import { Text, View, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProfile, toggleFollow } from "../../api/endpoints";
import { Avatar, Button, Loading, EmptyState } from "../../components/ui";
import { TripCard } from "../../components/TripCard";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center">
      <Text className="font-serif text-2xl font-bold text-ink">{value}</Text>
      <Text className="font-sans text-xs uppercase tracking-wider text-zinc-400">{label}</Text>
    </View>
  );
}

export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => fetchProfile(username!),
  });

  const follow = useMutation({
    mutationFn: (next: boolean) => toggleFollow(data!.user._id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", username] }),
  });

  if (isLoading) return <Loading />;
  if (!data?.user) return <EmptyState icon="person-outline" title="Profile not found" />;

  const { user, trips = [], isFollowing } = data;

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 20 }}>
      <View className="items-center">
        <Avatar uri={user.avatar} name={user.name} size={88} />
        <Text className="mt-3 font-serif text-2xl font-bold text-ink">{user.name}</Text>
        {user.username ? <Text className="font-sans text-sm text-zinc-500">@{user.username}</Text> : null}
        {user.bio ? (
          <Text className="mt-2 max-w-[80%] text-center font-sans text-sm leading-5 text-zinc-500">{user.bio}</Text>
        ) : null}

        <View className="mt-5 w-full flex-row justify-around border-y border-ink/5 py-4">
          <Stat label="Followers" value={user.followersCount ?? 0} />
          <Stat label="Following" value={user.followingCount ?? 0} />
        </View>

        <View className="mt-5 w-full">
          <Button
            label={isFollowing ? "Following" : "Follow"}
            variant={isFollowing ? "outline" : "primary"}
            icon={isFollowing ? "checkmark" : "person-add-outline"}
            loading={follow.isPending}
            onPress={() => follow.mutate(!isFollowing)}
          />
        </View>
      </View>

      <Text className="mb-3 mt-8 font-sans text-xs font-bold uppercase tracking-widest text-zinc-400">Trips</Text>
      {trips.length === 0 ? (
        <Text className="font-sans text-sm text-zinc-400">No public trips yet.</Text>
      ) : (
        trips.map((t) => <TripCard key={t._id} trip={t} />)
      )}
    </ScrollView>
  );
}
