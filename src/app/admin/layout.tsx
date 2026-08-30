import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/api/handler';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Third barrier, and the one that protects server-rendered content: the
  // proxy guards the request, this guards the render.
  try {
    await requireAdmin();
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <nav className="mb-4 flex gap-4 text-sm">
        <Link href="/admin/leaders" className="font-medium">Leaders</Link>
        <Link href="/admin/metas" className="font-medium">Metas</Link>
      </nav>
      {children}
    </div>
  );
}
