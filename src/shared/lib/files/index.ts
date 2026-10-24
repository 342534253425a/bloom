/**
 * Files and folders in chats: collecting what was dropped or picked (a folder becomes one .zip, like Telegram
 * suggests for folders), and saving a received file on the device.
 */
import { zip } from "fflate";
import { shell } from "@/shared/lib/native";

type Entry = { file: File; path: string };

/** Packs files (with their paths inside the folder) into "<name>.zip". */
export async function zipFolder(name: string, entries: Entry[]): Promise<File> {
  const tree: Record<string, Uint8Array> = {};
  for (const entry of entries) tree[entry.path] = new Uint8Array(await entry.file.arrayBuffer());
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(tree, { level: 6 }, (error, out) => (error ? reject(error) : resolve(out))));
  return new File([data.slice().buffer as ArrayBuffer], `${name}.zip`, { type: "application/zip" });
}

async function walk(dir: FileSystemDirectoryEntry, base: string, out: Entry[]) {
  const reader = dir.createReader();
  // readEntries returns the folder in pieces; keep asking until it's empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const entry of batch) {
      const path = `${base}/${entry.name}`;
      if (entry.isDirectory) await walk(entry as FileSystemDirectoryEntry, path, out);
      else out.push({ file: await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)), path });
    }
  }
}

/** Everything dropped on the chat: files as they are, each folder as one .zip. */
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const items = [...data.items].filter((item) => item.kind === "file");
  // The browser hands these out only during the drop event itself, so take them all before waiting on anything.
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  const plain = items.map((item) => item.getAsFile());
  if (!entries.some((entry) => entry?.isDirectory)) return plain.filter((file): file is File => Boolean(file));
  const files: File[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry?.isDirectory) {
      const inside: Entry[] = [];
      await walk(entry as FileSystemDirectoryEntry, entry.name, inside);
      files.push(await zipFolder(entry.name, inside));
    } else {
      const file = plain[index];
      if (file) files.push(file);
    }
  }
  return files;
}

/** A folder picked with the folder button (files carry webkitRelativePath) → one .zip. */
export async function pickedFolder(list: FileList): Promise<File | null> {
  const files = [...list];
  if (!files.length) return null;
  const name = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "folder";
  return zipFolder(
    name,
    files.map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name })),
  );
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A small picture for the file card. */
export function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "📊";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "📽️";
  if (["mp3", "wav", "flac", "m4a", "ogg", "aac"].includes(ext)) return "🎵";
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return "🎬";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "🖼️";
  if (["apk", "exe", "msi", "dmg"].includes(ext)) return "📦";
  return "📎";
}

/**
 * Saves a received file. Computers download it; the Android app writes it to the app's files and opens
 * Android's share sheet ("Save to Files", or open it with another app) — the WebView can't download by itself.
 */
export async function saveFile(url: string, name: string) {
  const capacitor = (window as unknown as { Capacitor?: { isPluginAvailable?: (name: string) => boolean } }).Capacitor;
  // An older Android app without the file plugin: let the browser download a plain link.
  if (shell === "android" && !capacitor?.isPluginAvailable?.("Filesystem") && url.startsWith("http")) {
    const { openOutside } = await import("@/shared/lib/native");
    return void openOutside(url);
  }
  if (shell === "android") {
    const blob = await fetch(url).then((res) => res.blob());
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const written = await Filesystem.writeFile({ path: `received/${Date.now()}-${name}`, data: base64, directory: Directory.Cache, recursive: true });
    await Share.share({ title: name, files: [written.uri] });
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
