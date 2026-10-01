"use client";
import { ThemeProvider as Provider } from "next-themes";
import type { ReactNode } from "react";
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <Provider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey="panel-theme"
      disableTransitionOnChange
    >
      {children}
    </Provider>
  );
}
