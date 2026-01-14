import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="id">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Aplikasi Manajemen Keuangan Sekolah" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="shortcut icon" href="/logo.png" />
        
        {/* PWA and Mobile Optimization */}
        <meta name="application-name" content="Keuangan Sekolah" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Keuangan" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
