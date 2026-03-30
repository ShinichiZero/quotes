export interface Quote {
  text: string;
  saint: string;
  feastDay?: string;
  category: "Peace" | "Courage" | "Virtue" | "Wisdom" | "Love";
}

// A representative array of Saint quotes for the Wisdom Engine.
// In a full production build, this would contain all 365 quotes.
export const quotes: Quote[] = [
  { text: "Pray, hope, and don't worry.", saint: "St. Padre Pio", feastDay: "Sept 23", category: "Peace" },
  { text: "Have patience with all things, but chiefly have patience with yourself.", saint: "St. Francis de Sales", feastDay: "Jan 24", category: "Virtue" },
  { text: "To love God as He ought to be loved, we must be detached from all temporal love.", saint: "St. Teresa of Avila", feastDay: "Oct 15", category: "Love" },
  { text: "Our hearts are restless until they rest in You.", saint: "St. Augustine", feastDay: "Aug 28", category: "Peace" },
  { text: "Act, and God will act.", saint: "St. Joan of Arc", feastDay: "May 30", category: "Courage" },
  { text: "Nothing great is ever achieved without much enduring.", saint: "St. Catherine of Siena", feastDay: "Apr 29", category: "Courage" },
  { text: "Love to be real, it must cost—it must hurt—it must empty us of self.", saint: "Mother Teresa", feastDay: "Sep 5", category: "Love" },
  { text: "Faith is to believe what you do not see; the reward of this faith is to see what you believe.", saint: "St. Augustine", feastDay: "Aug 28", category: "Wisdom" },
  { text: "Be who God meant you to be and you will set the world on fire.", saint: "St. Catherine of Siena", feastDay: "Apr 29", category: "Virtue" },
  { text: "The world offers you comfort. But you were not made for comfort. You were made for greatness.", saint: "Pope Benedict XVI", category: "Courage" },
];

export function getDailyQuoteIndex(): number {
  const now = new Date();
  // Simple deterministic index based on the day of the year
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
  return dayOfYear % quotes.length;
}