// The turnkey facade: theme state + mobile-chrome sync in one wrap. See ./README.md
import type { ReactNode } from "react";

import { ThemeStateProvider } from "./ThemeStateProvider";
import { BrowserChromeSync } from "./internal/BrowserChromeSync";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeStateProvider>
      <BrowserChromeSync />
      {children}
    </ThemeStateProvider>
  );
}
