import Image from "next/image";
import BeforeAfter from "@/components/BeforeAfter";
import HeroPaint from "@/components/HeroPaint";
import { FromPrice, Testimonials } from "@/components/Live";
import Lens from "@/components/Lens";
import LookFinder from "@/components/LookFinder";
import Services from "@/components/Services";
import Strip from "@/components/Strip";
import { Btn, Marquee, SpinBadge } from "@/components/ui";
import { bookHref, results, studio, waBook } from "@/lib/site";

export default function Home() {
  const years = new Date().getFullYear() - studio.makeupSince;

  return (
    <>
      {/* Hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__blobs" aria-hidden="true"><i /><i /><i /></div>
        <HeroPaint />
        <div className="wrap hero__grid">
          <div className="hero__text">
            <span className="eyebrow">Makeup artistry · {studio.area}</span>
            <h1 id="hero-title">
              <span className="line"><span>Makeup that</span></span>
              <span className="line"><span>looks like <em>you,</em></span></span>
              <span className="line"><span>on your best day.</span></span>
            </h1>
            <div className="hero__sub">
              <p className="lead">Soft glam, glam and bridal by Betty. In the studio or at your door. See live times and book in a minute.</p>
              <div className="cta-row" style={{ marginTop: 0 }}>
                <Btn href={bookHref()} label="Book an appointment" />
                <Btn href="/gallery" label="See the gallery" variant="ghost" />
              </div>
            </div>
          </div>
          <div className="hero__media">
            <SpinBadge id="hero-badge" text={`Est. ${studio.established} · Donholm · Nairobi · `} />
            <div className="arch" data-cursor="Qoui">
              <div data-parallax="50" style={{ position: "absolute", inset: 0 }}>
                <Image src="/photos/terracotta-smoky.jpg" alt="Client wearing a terracotta smoky eye by Qoui Glam Studio" fill preload loading="eager"
                  sizes="(min-width: 960px) 40vw, 100vw" quality={80} style={{ objectFit: "cover", objectPosition: "50% 20%" }} />
              </div>
            </div>
            <span className="float-chip float-chip--a"><span className="dot">K</span><FromPrice /></span>
            <span className="float-chip float-chip--b"><span className="dot">→</span>House calls across Nairobi</span>
          </div>
        </div>
      </section>

      <Marquee items={[<>Soft glam</>, <><em>Glam</em></>, <>Bridal</>, <><em>House calls</em></>, <>Donholm, Nairobi</>, <><em>Book online</em></>]} />

      {/* Services */}
      <section className="section" aria-labelledby="services-title">
        <div className="wrap">
          <div className="head head--row reveal">
            <div style={{ display: "grid", gap: "1rem" }}>
              <span className="eyebrow">Services &amp; prices</span>
              <h2 id="services-title">Three looks. <em>One you.</em></h2>
            </div>
            <p className="lead">Every look includes skin prep, lashes where the look needs them and a setting finish that lasts.</p>
          </div>
          <Services />
        </div>
      </section>

      {/* Look finder */}
      <section className="section section--sand section--round" aria-labelledby="finder-title">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">Not sure which look?</span>
            <h2 id="finder-title">Find your look in <em>two taps.</em></h2>
          </div>
          <LookFinder />
        </div>
      </section>

      {/* Gallery strip */}
      <section className="section" aria-labelledby="gallery-title">
        <div className="wrap">
          <div className="head head--row reveal">
            <div style={{ display: "grid", gap: "1rem" }}>
              <span className="eyebrow">Recent faces</span>
              <h2 id="gallery-title">The <em>work.</em></h2>
            </div>
            <Btn href="/gallery" label="Full gallery" variant="ghost" />
          </div>
        </div>
        <Strip />
      </section>

      {/* Look closer / real results */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="closer-title">
        <div className="wrap">
          <div className="closer">
            <div className="reveal">
              <Lens src="/photos/terracotta-smoky-closed.jpg" alt="Close-up of a blended terracotta and black smoky eye with lashes" />
            </div>
            <div className="reveal" style={{ display: "grid", gap: "1.5rem", justifyItems: "start" }}>
              <span className="eyebrow">Real results</span>
              <h2 id="closer-title">Look <em>closer.</em></h2>
              <p className="lead">No filters, no retouching. Run the glass over the blend: seamless terracotta into black, lashes set, skin that still looks like skin.</p>
              <Btn href={bookHref()} label="Book an appointment" />
            </div>
          </div>
          {results.length > 0 && (
            <div className="results">
              {results.map((r) => <BeforeAfter key={r.id} label={r.label} before={r.before} after={r.after} />)}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials (managed in Admin → Reviews; hidden until there's one) */}
      <Testimonials />

      {/* About */}
      <section className="section" aria-labelledby="about-title">
        <div className="wrap about">
          <div className="about__media reveal">
            <div className="about__img">
              <Image src={studio.bettyPhoto} alt="Betty, makeup artist and founder of Qoui Glam Studio" width={960} height={1280}
                sizes="(min-width: 900px) 40vw, 100vw" quality={80} />
            </div>
            <SpinBadge id="about-badge" text="Your skin · Your face · Your day · " />
          </div>
          <div className="about__text reveal">
            <span className="eyebrow">About</span>
            <h2 id="about-title">Hi, I&apos;m <em>Betty.</em></h2>
            <p className="lead">
              I&apos;ve been doing makeup since {studio.makeupSince}, for brides, graduates and women who just want to feel like themselves, turned up. I work with
              your skin, not over it, and I make sure it lasts until the last photo.
            </p>
            <div className="stats">
              <div><b>{years}+</b><span>years doing makeup, since {studio.makeupSince}</span></div>
              <div><b>{studio.established}</b><span>studio opened in Donholm</span></div>
              <div><b>3</b><span>looks, one price list</span></div>
            </div>
            <Btn href={bookHref()} label="Book with Betty" />
          </div>
        </div>
      </section>

      {/* How booking works */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="how-title">
        <div className="wrap">
          <div className="head reveal">
            <span className="eyebrow">How booking works</span>
            <h2 id="how-title">Three steps. <em>All on WhatsApp.</em></h2>
          </div>
          <ol className="steps">
            <li className="reveal"><h3>Pick your look</h3><p className="muted">Book here in a minute, or message us on WhatsApp. Our assistant replies straight away.</p></li>
            <li className="reveal"><h3>Choose your time</h3><p className="muted">See Betty&apos;s live calendar. Studio in Donholm or a house call.</p></li>
            <li className="reveal"><h3>Send your deposit</h3><p className="muted">Pay the deposit by M-Pesa to hold your slot. Betty confirms.</p></li>
          </ol>
        </div>
      </section>
    </>
  );
}
