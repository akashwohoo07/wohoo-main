import AuthHero from "../components/AuthHero";
import { useSeo } from "../lib/seo";

export default function Signup() {
  useSeo({ title: "Sign up free", description: "Create a free Wohoo account to plan trips, build travel itineraries, invite friends, and split expenses." });
  return <AuthHero initialTab="signup" />;
}
