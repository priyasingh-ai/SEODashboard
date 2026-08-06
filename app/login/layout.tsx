import type { Metadata } from "next";

/**
 * Exists solely to give the login route its own title — `page.tsx` is a client
 * component, and `metadata` can only be exported from a server one.
 */
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SEO Portfolio dashboard.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
