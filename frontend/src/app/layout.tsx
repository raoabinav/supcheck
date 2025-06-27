import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { CredentialsProvider } from '@/context/CredentialsContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Supabase Compliance Checker',
  description: 'Check your Supabase project for compliance with security best practices',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-white text-black`} suppressHydrationWarning>
        <CredentialsProvider>
          {children}
        </CredentialsProvider>
      </body>
    </html>
  );
}
