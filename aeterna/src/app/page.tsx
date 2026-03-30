import BentoGrid from "@/components/BentoGrid";
import ScrollSequence from "@/components/ScrollSequence";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center flex-nowrap font-[family-name:var(--font-geist-sans)] selection:bg-[#2c2412] selection:text-white">
      {/* Anchor - Hero / Scroll Sequence */}
      <ScrollSequence />

      {/* Guide - The Bento Grid */}
      <BentoGrid />
      
      {/* Ship - Divine Newsletter CTA */}
      <section className="relative z-20 w-full max-w-4xl text-center py-32 border-t border-white/5 bg-gradient-to-t from-black via-transparent to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(44,36,18,0.2)_0%,transparent_70%)] pointer-events-none" />
        <h2 className="text-4xl md:text-5xl mb-4 font-[family-name:var(--font-cormorant)] tracking-tighter text-white/90">
          Seek the Light Daily
        </h2>
        <p className="text-white/40 mb-10 text-sm tracking-wide">Enter the Divine Newsletter</p>
        
        {/* Rainbow Button (Gold/Silver Variant) */}
        <button className="relative inline-flex h-14 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-[#2c2412] focus:ring-offset-2 focus:ring-offset-[#050505] hover:scale-105 transition-transform duration-300">
          <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#8A8A8A_0%,#2c2412_50%,#8A8A8A_100%)]" />
          <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-[#050505] px-10 py-1 text-sm font-medium text-white backdrop-blur-3xl tracking-widest uppercase">
            Subscribe
          </span>
        </button>
      </section>
    </main>
  );
}
