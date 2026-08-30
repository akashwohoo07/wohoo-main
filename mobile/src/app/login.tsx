import { useState } from "react";
import { Text, View, Alert } from "react-native";
import { Image } from "expo-image";
import { useAuth } from "../auth/AuthProvider";
import { Button, Screen } from "../components/ui";

const HERO = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80";

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState<"login" | "signup" | null>(null);

  const handle = async (mode: "login" | "signup") => {
    setBusy(mode);
    try {
      await signIn(mode);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (e?.response?.data?.code === "no_account") {
        Alert.alert("No account yet", "We couldn't find that account. Tap “Sign up” to create one.");
      } else if (msg) {
        Alert.alert("Sign-in failed", msg);
      } else if (e?.code !== "SIGN_IN_CANCELLED" && e?.message !== "Sign in action cancelled") {
        Alert.alert("Sign-in failed", "Please try again.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-1">
        <View className="h-[45%] w-full">
          <Image source={HERO} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        </View>

        <View className="flex-1 justify-center px-7">
          <View className="mb-2 flex-row items-baseline">
            <Text className="font-serif text-4xl font-bold text-rose-500">Wohoo</Text>
            <Text className="font-serif text-4xl font-bold text-ink">.in</Text>
          </View>
          <Text className="mb-8 font-sans text-base leading-6 text-zinc-500">
            Plan trips together — itineraries, places, and people, all in one place.
          </Text>

          <View className="gap-3">
            <Button
              label="Continue with Google"
              icon="logo-google"
              onPress={() => handle("login")}
              loading={busy === "login"}
            />
            <Button
              label="Create a new account"
              variant="outline"
              onPress={() => handle("signup")}
              loading={busy === "signup"}
            />
          </View>

          <Text className="mt-6 text-center font-sans text-xs text-zinc-400">
            By continuing you agree to our Terms of Service.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
