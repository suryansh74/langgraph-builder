import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LangGraph Builder',
  description: 'Visual LangGraph builder with hierarchical agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
