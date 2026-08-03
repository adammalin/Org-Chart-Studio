import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ORNL OrgChart Studio",
    template: "%s | ORNL OrgChart Studio",
  },
  description:
    "A working technical prototype for governed organizational chart data, layout, review, and export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
