"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/contexts/theme-context";

/** Global toast host — follows app light/dark theme. Inline form messages are unchanged. */
export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme === "dark" ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
      expand={false}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast: "app-toast",
          title: "app-toast-title",
          description: "app-toast-description",
          actionButton: "app-toast-action",
          cancelButton: "app-toast-cancel",
          closeButton: "app-toast-close",
        },
      }}
    />
  );
}
