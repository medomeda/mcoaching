import { MessagesSquare } from "lucide-react";

/** Logo Mentora : bulles de conversation sur fond or (même dessin que `app/icon.svg`). */
export function LogoMark({ size = "md" }: { size?: "md" | "sm" }) {
  const box = size === "sm" ? "size-7" : "size-8";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-lg bg-gold-500 text-brand-900`} aria-hidden>
      <MessagesSquare className="size-5" />
    </span>
  );
}
