import type { ReactNode } from "react";

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">{children}</div>;
}
