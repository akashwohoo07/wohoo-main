import { ReactNode } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function Screen({
  children,
  edges = ["top"],
  className = "",
}: {
  children: ReactNode;
  edges?: Edge[];
  className?: string;
}) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-cream ${className}`}>
      {children}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "outline";
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center gap-2 rounded-full px-6 py-4 ${
        isPrimary ? "bg-rose-500" : "border border-ink/10 bg-white"
      } ${disabled || loading ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : colors.rose} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={isPrimary ? "#fff" : colors.ink} />}
          <Text className={`font-sans text-[15px] font-semibold ${isPrimary ? "text-white" : "text-ink"}`}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-cream">
      <ActivityIndicator color={colors.rose} size="large" />
      {label ? <Text className="font-sans text-sm text-zinc-500">{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-10">
      <Ionicons name={icon} size={44} color={colors.zinc400} />
      <Text className="text-center font-sans text-base font-semibold text-ink">{title}</Text>
      {subtitle ? (
        <Text className="text-center font-sans text-sm leading-5 text-zinc-500">{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function Avatar({ uri, name, size = 40 }: { uri?: string; name?: string; size?: number }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (uri) {
    return (
      <View style={{ width: size, height: size }} className="overflow-hidden rounded-full bg-zinc-200">
        {/* expo-image gives caching + fast decode */}
        {/* eslint-disable-next-line @typescript-eslint/no-var-requires */}
        <ExpoImg uri={uri} size={size} />
      </View>
    );
  }
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-full bg-rose-100"
    >
      <Text className="font-sans font-bold text-rose-500" style={{ fontSize: size * 0.4 }}>
        {initials}
      </Text>
    </View>
  );
}

// Small wrapper so Avatar can stay presentational.
import { Image as ExpoImage } from "expo-image";
function ExpoImg({ uri, size }: { uri: string; size: number }) {
  return <ExpoImage source={uri} style={{ width: size, height: size }} contentFit="cover" transition={150} />;
}
