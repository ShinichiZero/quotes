"use client";

import { useRef, MouseEvent } from "react";
import DailyQuote from "./DailyQuote";
import { motion } from "framer-motion";

const quotes = [
  { text: "Have patience with all things.", saint: "St. Francis de Sales", category: "Virtue" },
  { text: "To love God as He ought to be loved.", saint: "St. Teresa of Avila", category: "Love" },
  { text: "Act, and God will act.", saint: "St. Joan of Arc", category: "Courage" },
];

export default function BentoGrid() {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;
    const cards = gridRef.current.getElementsByClassName("bento-card");
    for (const card of Array.from(cards)) {
      const rect = (card as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      (card as HTMLElement).style.setProperty("--mouse-x", `${x}px`);
      (card as HTMLElement).style.setProperty("--mouse-y", `${y}px`);
    }
  };

  return (
    <section 
      ref={gridRef}
      onMouseMove={handleMouseMove}
      className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-6 p-6 pb-32 relative z-20"
    >
      <DailyQuote />
      
      {quotes.map((q, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
          whileHover={{ scale: 1.02 }}
          className="bento-card group relative aspect-square backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col justify-center gap-4 transition-transform duration-500 overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(255,255,255,0.05)_0%,transparent_60%)]" />
          
          <div className="text-[0.65rem] text-white/30 tracking-[0.2em] uppercase absolute top-8 left-8">
            [{q.category}]
          </div>
          
          <p className="text-2xl font-[family-name:var(--font-cormorant)] tracking-tighter text-white/80 group-hover:text-white transition-colors duration-300 relative z-10">
            "{q.text}"
          </p>
          <div className="text-xs text-white/40 tracking-wider uppercase flex items-center gap-2 relative z-10">
            <span className="w-4 h-[1px] bg-white/10 inline-block" />
            {q.saint}
          </div>
        </motion.div>
      ))}
    </section>
  );
}