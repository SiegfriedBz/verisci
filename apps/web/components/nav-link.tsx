"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A header link that shows when its page is the one open. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`text-sm font-medium transition-colors ${current ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
