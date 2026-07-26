// See ./README.md
import { createContext } from "react";
import type { ThemeContextValue } from "./types";

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
