import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-white dark:bg-black">
      <h1 className="text-2xl font-bold mb-3">Sorry, this page isn&apos;t available.</h1>
      <p className="text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
        The link you followed may be broken, or the page may have been removed.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg bg-[#0095F6] hover:bg-[#1877F2] text-white font-semibold text-sm transition"
      >
        Go back to VistaGram
      </Link>
    </main>
  );
}
