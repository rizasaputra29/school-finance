import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '@/context/AuthContext';
import { AcademicYearProvider } from '@/context/AcademicYearContext';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === '/login';

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <ErrorBoundary>
        <AuthProvider>
          <AcademicYearProvider>
            {isLoginPage ? (
              <Component {...pageProps} />
            ) : (
              <Layout>
                <Component {...pageProps} />
              </Layout>
            )}
          </AcademicYearProvider>
        </AuthProvider>
      </ErrorBoundary>
    </>
  );
}
