"use client";

// Delete a Test project: press once to arm, again to confirm (it can't be undone).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeleteProject({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 5000); return () => clearTimeout(t); }, [armed]);

  async function remove() {
    if (!armed) return setArmed(true);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
      const out = await res.json();
      if (!res.ok) return void toast.error(out.error);
      toast.success(`Deleted “${name}”, with its history, files and Excel workbooks.`);
      router.refresh();
    } finally { setBusy(false); setArmed(false); }
  }

  return (
    <Button size="sm" variant={armed ? "default" : "ghost"} className={armed ? "" : "text-bad"} disabled={busy} onClick={remove}
      title="Deletes the project, its history, files and Excel workbooks. Can't be undone.">
      {busy ? "Deleting…" : armed ? "Confirm: delete for good" : "Delete"}
    </Button>
  );
}
