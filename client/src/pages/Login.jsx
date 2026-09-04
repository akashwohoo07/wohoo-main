import AuthHero from "../components/AuthHero";
import { useSeo } from "../lib/seo";

export default function Login() {
  useSeo({ title: "Log in", description: "Log in to Wohoo to plan trips, build travel itineraries, and split expenses with friends." });
  return <AuthHero initialTab="login" />;
}
