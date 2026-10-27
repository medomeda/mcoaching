/**
 * Stockage privé des pièces jointes sur disque (PRD §9.9), hors du dossier public.
 * Les fichiers sont nommés par une clé générée par le système (jamais par le nom d'origine) :
 * seule la route de téléchargement les lit, après contrôle d'autorisation.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = /^att_[0-9a-f]{32}$/;

function root() {
  return path.resolve(process.env.PRIVATE_STORAGE_PATH || "storage/private");
}

/** Chemin d'un fichier ; la clé est validée (aucune traversée de répertoire possible). */
function fileOf(key: string) {
  if (!KEY.test(key)) throw new Error("Clé de stockage invalide.");
  return path.join(root(), key.slice(4, 6), key);
}

export const privateFiles = {
  async put(key: string, data: ArrayBuffer): Promise<void> {
    const file = fileOf(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    // Écriture atomique : un fichier n'est jamais lisible à moitié écrit.
    const tmp = `${file}.tmp`;
    await writeFile(tmp, Buffer.from(data), { mode: 0o600, flag: "wx" });
    await rename(tmp, file);
  },

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(fileOf(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },

  async delete(key: string): Promise<void> {
    await rm(fileOf(key), { force: true });
  },
};
