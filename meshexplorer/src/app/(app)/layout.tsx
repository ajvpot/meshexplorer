import Header from "@/components/Header";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="flex-1 flex flex-col w-full bg-neutral-200 dark:bg-neutral-800">
        {children}
      </main>
    </>
  );
}
