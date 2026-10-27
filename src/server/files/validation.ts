/**
 * Validation des pièces jointes côté « serveur » (PRD §9.9) :
 * extension en liste blanche, taille maximale, signature binaire (magic bytes) cohérente
 * avec l'extension, nom de fichier assaini. Le type MIME du navigateur n'est jamais cru.
 */
import { validation } from "@/modules/core/errors";

export interface UploadInput {
  name: string;
  data: ArrayBuffer;
}

export interface ValidatedFile {
  originalName: string;
  extension: string;
  mime: string;
  size: number;
  data: ArrayBuffer;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const SUPPORTED_EXTENSIONS = Object.keys(MIME);

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

function signatureMatches(ext: string, bytes: Uint8Array): boolean {
  switch (ext) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "docx":
    case "xlsx":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // conteneur ZIP OOXML
    case "txt":
    case "csv": {
      // Texte : aucun octet nul et UTF-8 valide sur l'échantillon.
      const sample = bytes.subarray(0, 8192);
      if (sample.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(sample.length === 8192 ? sample.subarray(0, 8000) : sample);
        return true;
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fichier";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "fichier").slice(0, 150);
}

export function validateUpload(
  file: UploadInput,
  settings: { attachment_max_size_bytes: number; attachment_allowed_extensions: string[] },
): ValidatedFile {
  const originalName = sanitizeFilename(file.name);
  const ext = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
  const allowed = settings.attachment_allowed_extensions.filter((e) => SUPPORTED_EXTENSIONS.includes(e));
  if (!ext || !allowed.includes(ext)) {
    throw validation(`Format non autorisé pour « ${originalName} ». Formats acceptés : ${allowed.join(", ")}.`);
  }
  if (file.data.byteLength === 0) throw validation(`Le fichier « ${originalName} » est vide.`);
  if (file.data.byteLength > settings.attachment_max_size_bytes) {
    const mb = (settings.attachment_max_size_bytes / 1024 / 1024).toFixed(1);
    throw validation(`Le fichier « ${originalName} » dépasse la taille maximale de ${mb} Mo.`);
  }
  if (!signatureMatches(ext, new Uint8Array(file.data))) {
    throw validation(`Le contenu de « ${originalName} » ne correspond pas à son extension. Fichier refusé.`);
  }
  return { originalName, extension: ext, mime: MIME[ext]!, size: file.data.byteLength, data: file.data };
}
