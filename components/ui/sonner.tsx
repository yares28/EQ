"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CheckCircle,
  CircleNotch,
  Info,
  Warning,
  XCircle,
} from "@/components/eq/icon"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle className="size-4" weight="regular" />
        ),
        info: (
          <Info className="size-4" weight="regular" />
        ),
        warning: (
          <Warning className="size-4" weight="regular" />
        ),
        error: (
          <XCircle className="size-4" weight="regular" />
        ),
        loading: (
          <CircleNotch className="size-4 animate-spin" weight="regular" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
