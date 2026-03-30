"use client";

import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

export default function ScrollSequence() {
  const { scrollYProgress } = useScroll();
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrame, setCurrentFrame] = useState<string>("");

  // Simulation of loading image sequences
  // Replace these URLs or path names with your actual /images sequence images
  useEffect(() => {
    // Generate a sequence of image paths, for example frame_001.jpg up to frame_100.jpg
    const frameCount = 30; // Total frames
    const framePaths = Array.from({ length: frameCount }).map(
      (_, i) => `/images/frame_${(i + 1).toString().padStart(3, "0")}.png`
    );
    setFrames(framePaths);
    setCurrentFrame(framePaths[0] ?? "");
    setImagesLoaded(true);
  }, []);

  // Map scroll progress to the exact frame index
  const activeFrameIndex = useTransform(
    scrollYProgress,
    [0, 1],
    [0, frames.length > 0 ? frames.length - 1 : 0]
  );

  useMotionValueEvent(activeFrameIndex, "change", (latest) => {
    if (!frames.length) {
      return;
    }

    const safeIndex = Math.min(
      frames.length - 1,
      Math.max(0, Math.floor(Number(latest)))
    );
    setCurrentFrame(frames[safeIndex]);
  });

  return (
    <section className="relative h-[200vh] w-full flex justify-center items-start pt-[30vh]">
      <motion.div
        className="sticky top-[30vh] z-0 h-[60vh] w-full max-w-4xl opacity-50 pointer-events-none flex items-center justify-center overflow-hidden mix-blend-screen"
        style={{
          scale: useTransform(scrollYProgress, [0, 1], [1, 1.2]),
          opacity: useTransform(scrollYProgress, [0, 0.4, 0.8], [0.5, 0.9, 0]),
          rotate: useTransform(scrollYProgress, [0, 1], [0, 10])
        }}
      >
        {imagesLoaded && frames.length > 0 && (
          <motion.img
            src={currentFrame || frames[0]}
            className="w-full h-full object-contain filter brightness-150 contrast-125"
            alt="Sequence Frame"
          />
        )}
      </motion.div>
      <h1 className="z-10 absolute top-[30vh] text-6xl md:text-8xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 font-bold m-0 p-8 text-center drop-shadow-2xl mix-blend-screen pointer-events-none select-none filter blur-0">
        Ancient Wisdom <br />
        <span className="font-[family-name:var(--font-cormorant)] italic font-light tracking-tight text-white/80">
          for a Modern World.
        </span>
      </h1>
      <div className="absolute top-[45vh] w-full flex justify-center opacity-30 pointer-events-none z-10 animate-pulse">
        <p className="tracking-widest uppercase text-xs text-white/60 font-medium">Scroll to Deconstruct</p>
      </div>
    </section>
  );
}