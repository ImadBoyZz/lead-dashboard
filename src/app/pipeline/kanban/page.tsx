import { redirect } from "next/navigation";

export default function KanbanRedirectPage() {
  redirect("/pipeline?view=board");
}
