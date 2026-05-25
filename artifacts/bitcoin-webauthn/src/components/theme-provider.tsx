import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, [theme]);

  return <>{children}</>;
}
