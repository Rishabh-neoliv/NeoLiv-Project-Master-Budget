// The old "All projects" address: projects are now under Live projects and Test projects.
import { redirect } from "next/navigation";

export default function OldAllProjects() {
  redirect("/admin/live");
}
