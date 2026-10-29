import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HCDGC Stats",
    template: "%s · HCDGC Stats",
  },
  description: "Player performance at HCDGC league events and tournaments",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <nav className="mx-auto flex w-full max-w-4xl items-center gap-4 whitespace-nowrap px-4 py-4 sm:gap-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
              {/* White artwork on transparent; inverted to black in light mode. */}
              <Image
                src="/logos/hcdgc-wordmark.png"
                alt="HCDGC"
                width={800}
                height={202}
                priority
                unoptimized
                className="h-6 w-auto invert sm:h-7 dark:invert-0"
              />
              <span>Stats</span>
            </Link>
            <Link
              href="/players"
              className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              Players
            </Link>
            <Link
              href="/layouts"
              className="text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              Layouts
            </Link>
            <Link
              href="/admin"
              className="ml-auto text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              Admin
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
          {children}
        </main>
        {/* PDGA requires this credit, with a link to pdga.com, on every screen showing its
            data. Official logo files, unaltered: blue on light backgrounds, white on dark. */}
        <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-6 text-sm text-zinc-600 dark:text-zinc-400">
            <a href="https://www.pdga.com/" target="_blank" rel="noopener noreferrer" className="p-1">
              <Image
                src="/logos/pdga/pdga-logo-blue.svg"
                alt="PDGA"
                width={461}
                height={114}
                unoptimized
                className="h-6 w-auto dark:hidden"
              />
              <Image
                src="/logos/pdga/pdga-logo-white.svg"
                alt="PDGA"
                width={461}
                height={114}
                unoptimized
                className="hidden h-6 w-auto dark:block"
              />
            </a>
            <p>
              Player, event, and course data provided by{" "}
              <a
                href="https://www.pdga.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#003462] hover:underline dark:text-[#009E91]"
              >
                PDGA
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
