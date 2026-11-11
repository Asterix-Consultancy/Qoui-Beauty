import type { Metadata } from "next";
import GalleryClient from "@/components/GalleryClient";
import { Marquee } from "@/components/ui";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Soft glam, glam and bridal looks by Qoui Glam Studio, Donholm, Nairobi.",
};

export default function GalleryPage() {
  return (
    <>
      <div className="wrap">
        <header className="page-head gallery-head">
          <span className="eyebrow">Gallery</span>
          <h1>The <em>work,</em><br />up close.</h1>
          <p className="lead">Real clients, real light, no filters. Tap any face to see it full screen.</p>
        </header>
      </div>
      <Marquee items={[<>Terracotta smoky</>, <><em>Red glam</em></>, <>Soft sculpt</>, <><em>Lashes on</em></>, <>Skin like skin</>]} />
      <div className="wrap" style={{ paddingTop: "clamp(2.5rem, 6vw, 4rem)" }}>
        <GalleryClient />
      </div>
    </>
  );
}
