/** Manifeste de la PWA et icônes (mode démo : aucune base nécessaire). */
import { existsSync } from "node:fs";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";

type Manifest = Awaited<ReturnType<typeof import("@/app/manifest").default>>;
let m: Manifest;

describe("manifeste de la PWA", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    m = await (await import("@/app/manifest")).default();
  });

  it("déclare une application autonome aux couleurs de Mentora", () => {
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#0e2340");
    expect(m.background_color).toBe("#f5f7fa");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.lang).toBe("fr");
  });

  it("prend le nom de la plateforme (valeur par défaut en démo)", () => {
    expect(m.name).toBe(DEFAULT_BRAND_NAME);
  });

  it("déclare trois icônes dont une « maskable », toutes présentes sur disque", () => {
    expect(m.icons).toHaveLength(3);
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons ?? []) expect(existsSync("public" + i.src), i.src).toBe(true);
  });

  it("fournit des icônes aux bonnes dimensions", async () => {
    const dims = async (f: string) => {
      const { width, height } = await sharp(f).metadata();
      return `${width}x${height}`;
    };
    expect(await dims("public/icons/icon-192.png")).toBe("192x192");
    expect(await dims("public/icons/icon-512.png")).toBe("512x512");
    expect(await dims("public/icons/icon-maskable-512.png")).toBe("512x512");
    expect(await dims("src/app/apple-icon.png")).toBe("180x180");
  });
});
