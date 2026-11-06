import type { Metadata } from "next";
import { WorkspaceProvider } from "@/platform/store";
import { PlatformShell } from "@/components/platform/shell";
import "./globals.css";
import "./platform.css";
import "@xyflow/react/dist/style.css";
export const metadata: Metadata = { title: { default: "DiagDoc — платформа диагностических знаний", template: "%s | DiagDoc" }, description: "Алгоритмы, проверки и практические случаи автомобильной диагностики." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ru"><body><WorkspaceProvider><PlatformShell>{children}</PlatformShell></WorkspaceProvider></body></html> }

