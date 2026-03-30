"use client";

import { useEffect, useState } from "react";
import { quotes, getDailyQuoteIndex, Quote } from "../data/quotes";
import { motion } from "framer-motion";

export default function DailyQuote() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      setQuote(quotes[getDailyQuoteIndex()]);
    }
  }, []);

  if (!isMounted) {
    return (
      <div className="md:col-span-2 aspect-video backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-10 flex flex-col justify-end animate-pulse">
        <div className="h-8 md:h-12 bg-white/10 rounded-lg w-3/4 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#2c2412]/50 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
        <div className="h-4 bg-white/10 rounded-md w-1/4" />
      </div>
    );
  }

  if (!quote) {
    return (
      <motion.div 
        className="md:col-span-2 aspect-video group relative backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-10 flex flex-col justify-end overflow-hidden"
      >
        <p className="text-3xl md:text-5xl font-[family-name:var(--font-cormorant)] tracking-tighter mb-6 leading-tight text-white/90">
          "God is Love."
        </p>
        <div className="flex items-center gap-4 text-white/50 tracking-wider uppercase">
          — St. John
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="md:col-span-2 aspect-video group relative backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-10 flex flex-col justify-end overflow-hidden transition-all duration-700 hover:border-white/20"
      whileHover={{ scale: 1.01 }}
    >
      <div className="absolute inset-0 pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(44,36,18,0.3)_0%,transparent_50%)]" />
      
      <motion.div 
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10"
      >
        <div className="text-xs text-[#2c2412] font-bold tracking-widest uppercase mb-4 py-1 px-3 border border-[#2c2412] inline-block rounded-full bg-[#2c2412]/10">Daily Bread</div>
        <p className="text-3xl md:text-5xl font-[family-name:var(--font-cormorant)] tracking-tighter mb-6 leading-tight text-white/90 group-hover:text-white transition-colors duration-300">
          "{quote.text}"
        </p>
        <div className="flex items-center gap-4">
          <div className="text-sm md:text-base text-white/50 tracking-wider uppercase flex items-center gap-2">
            <span className="w-6 h-[1px] bg-white/20 inline-block" />
            {quote.saint}
          </div>
          {quote.feastDay && (
            <div className="text-xs text-white/30 tracking-widest uppercase border-l border-white/10 pl-4">{quote.feastDay}</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
