import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { MainFrame } from "@/components/eq/main-frame";
import { Nav } from "@/components/eq/nav";
import { RouteMemory } from "@/components/eq/route-memory";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "EQ — salary intelligence",
  description:
    "Source-backed company compensation and growth rankings for software roles in Spain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full overflow-hidden`}>
      <body className="h-dvh overflow-hidden font-sans">
        <ConvexClientProvider>
          <div className="flex h-dvh flex-col overflow-hidden bg-background">
            <RouteMemory />
            <Nav />
            <MainFrame>{children}</MainFrame>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
