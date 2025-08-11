import type { Metadata } from "next";
import { notFound } from "next/navigation";

const supportedLocales = ["en", "ar"] as const;
type Locale = (typeof supportedLocales)[number];

export const metadata: Metadata = {
  title: {
    default: "Lebanon of Tomorrow",
    template: "%s | Lebanon of Tomorrow",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const casted = locale as Locale;
  if (!supportedLocales.includes(casted)) notFound();

  const dir = casted === "ar" ? "rtl" : "ltr";

  return (
    <div className={`${dir === "rtl" ? "dir-rtl" : "dir-ltr"} min-h-screen flex flex-col`}>
      {children}
    </div>
  );
}

