// The Qoui Glam Studio mark, rebuilt in type so it stays sharp and readable at any size:
// signature script "Qoui Glam" with its soft grey echo, "STUDIO" in serif caps, ESTD 2025.
export default function Logo({ size = "md", light = false }: { size?: "sm" | "md" | "lg" | "xl"; light?: boolean }) {
  return (
    <span className={`qlogo qlogo--${size}${light ? " qlogo--light" : ""}`} aria-label="Qoui Glam Studio, established 2025" role="img">
      <span className="qlogo__script" data-text="Qoui Glam" aria-hidden="true">Qoui Glam</span>
      <span className="qlogo__row" aria-hidden="true">
        <span className="qlogo__studio">Studio</span>
        <span className="qlogo__est"><span>Estd</span><span>2025</span></span>
      </span>
    </span>
  );
}
