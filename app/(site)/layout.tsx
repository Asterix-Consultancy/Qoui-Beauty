import Header, { BookBar } from "@/components/Header";
import Footer from "@/components/Footer";
import Interactions, { Cursor } from "@/components/Interactions";
import Loader from "@/components/Loader";

// Public website chrome: loader, header, footer, mobile book bar, cursor and motion.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Loader />
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <BookBar />
      <Cursor />
      <Interactions />
    </>
  );
}
