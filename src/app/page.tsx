"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/ui/display";
import { homeFor, useSession } from "@/components/providers";

export default function Home() {
  const { user, status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated" && user) router.replace(homeFor(user.role));
    if (status === "anonymous") router.replace("/login");
  }, [status, user, router]);
  return <Loading className="min-h-dvh" />;
}
