/**
 * Génère les icônes PNG de la PWA depuis src/app/icon.svg (à relancer seulement si le logo change) :
 *   node scripts/make-icons.mjs
 * Sorties : public/icons/icon-192.png, icon-512.png, icon-maskable-512.png et src/app/apple-icon.png (180).
 * La version « maskable » prolonge le fond jusqu'aux bords et réduit le dessin à 60 % : les systèmes
 * qui découpent l'icône (Android) ne rognent jamais les bulles.
 */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg", "utf8");
const glyph = /<g [^>]*>([\s\S]*)<\/g>/.exec(svg);
const bg = /<rect [^>]*fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1];
const stroke = /<g [^>]*stroke="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1];
if (!glyph || !bg || !stroke) throw new Error("icon.svg : structure inattendue (rect + g attendus).");

// Le dessin occupe 24 unités ; 60 % de la boîte de 32 = 19,2 unités, centré : échelle 0,8 et décalage 6,4.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${bg}"/><g transform="translate(6.4 6.4) scale(0.8)" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph[1]}</g></svg>`;

const render = (source, size, out) => sharp(Buffer.from(source), { density: (72 * size) / 32 * 4 }).resize(size, size).png().toFile(out);

mkdirSync("public/icons", { recursive: true });
await render(svg, 192, "public/icons/icon-192.png");
await render(svg, 512, "public/icons/icon-512.png");
await render(maskable, 512, "public/icons/icon-maskable-512.png");
await render(svg, 180, "src/app/apple-icon.png");
console.log("Icônes générées.");
