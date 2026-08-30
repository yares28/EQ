"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

// global-error replaces the root layout when it fires, so it must define its
// own <html>/<body> and cannot rely on layout.tsx's fonts or providers.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ maxWidth: "28rem", color: "#6a6a6a" }}>
          The app hit an unexpected error while rendering. Your data is safe.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            borderRadius: "0.5rem",
            border: "1px solid #ddd6cc",
            padding: "0.5rem 1rem",
            background: "#1a1917",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
