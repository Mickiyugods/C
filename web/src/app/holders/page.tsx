import { redirect } from "next/navigation";

// The page moved to /giveaways; keep /holders working for old links.
export default function Page() {
  redirect("/giveaways");
}
