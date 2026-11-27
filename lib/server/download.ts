// Downloads: every file goes to the browser through the app, marked as changed NOW. A browser gives a saved file the
// date the server sends (Last-Modified); a file served straight from storage carried its UPLOAD date, so in File
// Explorer an old master template or a frozen revision downloaded today sorted under its upload day, never "Today"
// (user, 2026-11-27). The bytes and the file name are unchanged.
import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { storageError } from "./data";

const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv",
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", dwg: "application/acad", zip: "application/zip", txt: "text/plain",
};

/** A file for the browser to save as `name`, dated now. */
export function fileResponse(body: BodyInit, name: string, type?: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return new Response(body, {
    headers: {
      "content-type": type || TYPES[ext] || "application/octet-stream",
      // a plain-ASCII name for old browsers, the real one (any characters) for the rest
      "content-disposition": `attachment; filename="${name.replace(/[^\w .()-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // the download's own time, so the saved file is dated today; and no cached copy with an older date
      "last-modified": new Date().toUTCString(),
      "cache-control": "no-store",
    },
  });
}

/** A file from a storage bucket, through the app (instead of a link straight to storage), dated now. */
export async function storageDownload(db: ReturnType<typeof createAdminClient>, bucket: string, path: string, name: string, notThere?: string) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw storageError(error, notThere);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return fileResponse(data, name, TYPES[ext] ? undefined : data.type || undefined);
}
