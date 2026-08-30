import { Text, View, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthProvider";
import { Screen, Avatar, Button } from "../../components/ui";
import { colors } from "../../theme";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center">
      <Text className="font-serif text-2xl font-bold text-ink">{value}</Text>
      <Text className="font-sans text-xs uppercase tracking-wider text-zinc-400">{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const confirmSignOut = () =>
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: signOut },
    ]);

  return (
    <Screen>
      <View className="items-center px-6 pt-8">
        <Avatar uri={user.avatar} name={user.name} size={96} />
        <Text className="mt-4 font-serif text-2xl font-bold text-ink">{user.name}</Text>
        {user.username ? <Text className="font-sans text-sm text-zinc-500">@{user.username}</Text> : null}
        {user.bio ? (
          <Text className="mt-2 max-w-[80%] text-center font-sans text-sm leading-5 text-zinc-500">{user.bio}</Text>
        ) : null}

        <View className="mt-6 w-full flex-row justify-around border-y border-ink/5 py-4">
          <Stat label="Followers" value={user.followersCount ?? 0} />
          <Stat label="Following" value={user.followingCount ?? 0} />
        </View>

        <View className="mt-8 w-full gap-3">
          <Button label="Log out" variant="outline" icon="log-out-outline" onPress={confirmSignOut} />
        </View>
      </View>

      <Pressable
        className="mt-auto mb-8 flex-row items-center justify-center gap-1 opacity-40"
        onPress={() => {}}
      >
        <Ionicons name="heart" size={12} color={colors.rose} />
        <Text className="font-sans text-xs text-zinc-400">Wohoo.in</Text>
      </Pressable>
    </Screen>
  );
}
