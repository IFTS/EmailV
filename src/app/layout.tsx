import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EmailV Pro - Enterprise Marketing Platform',
  description: 'Enterprise multi-tenant SaaS marketing platform with AI-powered campaigns',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-950 text-gray-100">
          {children}
        </div>
      </body>
    </html>
  );
}
