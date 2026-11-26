import { MessagesSquare } from "lucide-react";

/** Logo Mentora : bulles de conversation sur fond menthe (même dessin que `app/icon.svg`). */
export function LogoMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10" : "h-9 w-9";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-mint-200 text-logo-ink shadow-sm`} aria-hidden>
      <MessagesSquare className="h-5 w-5" />
    </span>
  );
}
