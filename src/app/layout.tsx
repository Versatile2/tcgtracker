import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { OfflineBadge } from '@/components/offline-badge';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Crew Stat',
  description: 'OPTCG tournament tracker',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Crew Stat', statusBarStyle: 'default' },
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
        <body className="antialiased">
          {/* FOUC guard: reads the accent before hydration. The 'indigo'
              literal here must stay in sync with DEFAULT_ACCENT in
              src/lib/accents.ts — this inline script can't import it. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var a=localStorage.getItem('crewstat-accent')||'indigo';document.documentElement.dataset.accent=a;}catch(e){document.documentElement.dataset.accent='indigo';}`,
            }}
          />
          <Providers>
            {children}
            <Toaster />
          </Providers>
          <ServiceWorkerRegister />
          <OfflineBadge />
        </body>
      </html>
    </ClerkProvider>
  );
}
