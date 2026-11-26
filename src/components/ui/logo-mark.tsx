import { MessagesSquare } from "lucide-react";

/** Logo Mentora : bulles de conversation sur fond or (même dessin que `app/icon.svg`). */
export function LogoMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10" : "h-9 w-9";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-gold-500 text-brand-900 shadow-sm`} aria-hidden>
      <MessagesSquare className="h-5 w-5" />
    </span>
  );
}
