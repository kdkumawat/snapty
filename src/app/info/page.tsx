import { redirect } from "next/navigation";

/** Legacy /info landing moved to the root. */
export default function InfoPage() {
  redirect("/");
}
