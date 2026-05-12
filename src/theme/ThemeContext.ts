import { createContext } from "react";
import type { ThemeContextValue } from "./types";

export const THEME_STORAGE_KEY = "theme-mode";

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
