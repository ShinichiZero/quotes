"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookmarkPlus,
  Copy,
  Download,
  Eraser,
  Filter,
  Flame,
  Grid2x2,
  Heart,
  Highlighter,
  List,
  Pin,
  Search,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import {
  categoryOptions,
  getDailyQuote,
  monthOptions,
  quotes,
  Quote,
  QuoteCategory,
  saintOptions,
  tagOptions,
} from "@/data/quotes";

type SortMode =
  | "relevance"
  | "saint-asc"
  | "saint-desc"
  | "length-asc"
  | "length-desc"
  | "month"
  | "random";

type ViewMode = "grid" | "list";

type ExportPayload = {
  favorites: number[];
  readingList: number[];
  notes: Record<number, string>;
  exportedAt: string;
};

const STORAGE_KEYS = {
  favorites: "aeterna:favorites:v3",
  readingList: "aeterna:reading-list:v3",
  notes: "aeterna:notes:v3",
  recentViewed: "aeterna:recent-viewed:v3",
  recentSearches: "aeterna:recent-searches:v3",
  streakCount: "aeterna:streak-count:v3",
  streakDay: "aeterna:streak-day:v3",
  highContrast: "aeterna:high-contrast:v3",
  fontScale: "aeterna:font-scale:v3",
  viewMode: "aeterna:view-mode:v3",
};

const FEATURE_LEDGER = [
  "Global search over saints and quotes",
  "Exact phrase search mode",
  "Recent search suggestions",
  "Filter by saint",
  "Multi-category chips",
  "Filter by feast month",
  "Filter by keyword tag",
  "Length range filtering",
  "Smart sort modes",
  "Grid/list presentation toggle",
  "Favorites with persistence",
  "Favorites-only mode",
  "Reading list with persistence",
  "Reading-list-only mode",
  "Private notes per quote",
  "Daily quote spotlight",
  "Random quote shuffle",
  "Recently viewed timeline",
  "Copy quote action",
  "Native/web share fallback",
  "Export user data JSON",
  "Import user data JSON",
  "Keyboard shortcuts",
  "High contrast mode",
  "Adjustable typography scale",
  "Focus mode",
  "Visit streak tracking",
];

const MAX_QUOTE_LENGTH = Math.max(...quotes.map((quote) => quote.text.length));
const MIN_QUOTE_LENGTH = Math.min(...quotes.map((quote) => quote.text.length));

function seededOrder(id: number, seed: number): number {
  const value = Math.sin(id * 999 + seed) * 10000;
  return value - Math.floor(value);
}

function parseSet(raw: string | null): Set<number> {
  if (!raw) {
    return new Set<number>();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<number>();
    }

    const next = parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));

    return new Set<number>(next);
  } catch {
    return new Set<number>();
  }
}

function parseRecord(raw: string | null): Record<number, string> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [Number(key), String(value ?? "")])
        .filter(([key]) => Number.isFinite(key))
    );
  } catch {
    return {};
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((value) => String(value)).slice(0, 8);
  } catch {
    return [];
  }
}

function parseNumberArray(raw: string | null): number[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .slice(0, 14);
  } catch {
    return [];
  }
}

function formatTodayISO(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function formatYesterdayISO(date: Date = new Date()): string {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function buildShareText(quote: Quote): string {
  return `"${quote.text}" - ${quote.saint}`;
}

function isInputLike(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(content: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) {
    return content;
  }

  const expression = new RegExp(`(${escapeRegex(trimmed)})`, "ig");
  const pieces = content.split(expression);
  const lowered = trimmed.toLowerCase();

  if (pieces.length === 1) {
    return content;
  }

  return pieces.map((piece, index) =>
    piece.toLowerCase() === lowered ? (
      <mark key={`${piece}-${index}`} className="rounded bg-amber-300/30 px-1 text-amber-100">
        {piece}
      </mark>
    ) : (
      <span key={`${piece}-${index}`}>{piece}</span>
    )
  );
}

export default function WisdomSanctuary() {
  const searchRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [exactPhrase, setExactPhrase] = useState(false);
  const [selectedSaint, setSelectedSaint] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [selectedCategories, setSelectedCategories] = useState<Set<QuoteCategory>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [pageSize, setPageSize] = useState(9);
  const [page, setPage] = useState(1);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [readingListOnly, setReadingListOnly] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [fontScale, setFontScale] = useState(100);
  const [minLength, setMinLength] = useState(MIN_QUOTE_LENGTH);
  const [maxLength, setMaxLength] = useState(MAX_QUOTE_LENGTH);
  const [randomSeed, setRandomSeed] = useState(() => Date.now());
  const [spotlightQuoteId, setSpotlightQuoteId] = useState(() => getDailyQuote().id);
  const [pinnedSaint, setPinnedSaint] = useState("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [readingList, setReadingList] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [recentViewed, setRecentViewed] = useState<number[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [streak, setStreak] = useState(1);

  const quoteById = useMemo(
    () => new Map(quotes.map((quote) => [quote.id, quote])),
    []
  );

  const dailyQuote = useMemo(() => getDailyQuote(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setFavorites(parseSet(window.localStorage.getItem(STORAGE_KEYS.favorites)));
    setReadingList(parseSet(window.localStorage.getItem(STORAGE_KEYS.readingList)));
    setNotes(parseRecord(window.localStorage.getItem(STORAGE_KEYS.notes)));
    setRecentViewed(parseNumberArray(window.localStorage.getItem(STORAGE_KEYS.recentViewed)));
    setRecentSearches(parseStringArray(window.localStorage.getItem(STORAGE_KEYS.recentSearches)));
    setHighContrast(window.localStorage.getItem(STORAGE_KEYS.highContrast) === "true");

    const storedScale = Number(window.localStorage.getItem(STORAGE_KEYS.fontScale));
    if (Number.isFinite(storedScale) && storedScale >= 85 && storedScale <= 130) {
      setFontScale(storedScale);
    }

    const storedViewMode = window.localStorage.getItem(STORAGE_KEYS.viewMode);
    if (storedViewMode === "grid" || storedViewMode === "list") {
      setViewMode(storedViewMode);
    }

    const today = formatTodayISO();
    const yesterday = formatYesterdayISO();
    const previousDay = window.localStorage.getItem(STORAGE_KEYS.streakDay);
    const previousCount = Number(window.localStorage.getItem(STORAGE_KEYS.streakCount) ?? "0");

    let nextCount = 1;

    if (previousDay === today && Number.isFinite(previousCount) && previousCount > 0) {
      nextCount = previousCount;
    } else if (previousDay === yesterday && Number.isFinite(previousCount) && previousCount > 0) {
      nextCount = previousCount + 1;
    }

    setStreak(nextCount);
    window.localStorage.setItem(STORAGE_KEYS.streakCount, String(nextCount));
    window.localStorage.setItem(STORAGE_KEYS.streakDay, today);

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(Array.from(favorites)));
  }, [favorites, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.readingList, JSON.stringify(Array.from(readingList)));
  }, [readingList, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  }, [notes, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.recentViewed, JSON.stringify(recentViewed));
  }, [recentViewed, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(recentSearches));
  }, [recentSearches, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.highContrast, String(highContrast));
  }, [highContrast, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.fontScale, String(fontScale));
  }, [fontScale, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.viewMode, viewMode);
  }, [viewMode, hydrated]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRecentSearches((previous) => {
        const next = [trimmed, ...previous.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())];
        return next.slice(0, 6);
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const categoryKey = useMemo(
    () => Array.from(selectedCategories).sort().join("|"),
    [selectedCategories]
  );

  useEffect(() => {
    setPage(1);
  }, [
    query,
    exactPhrase,
    selectedSaint,
    selectedMonth,
    selectedTag,
    categoryKey,
    favoritesOnly,
    readingListOnly,
    sortMode,
    minLength,
    maxLength,
    pageSize,
    pinnedOnly,
    pinnedSaint,
    randomSeed,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isInputLike(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (key === "f") {
        event.preventDefault();
        setFavoritesOnly((value) => !value);
      }

      if (key === "r") {
        event.preventDefault();
        setRandomSeed(Date.now());
      }

      if (key === "g") {
        event.preventDefault();
        setViewMode((value) => (value === "grid" ? "list" : "grid"));
      }

      if (event.key === "Escape") {
        setQuery("");
        setExpandedQuoteId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredQuotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    const scored = quotes
      .filter((quote) => {
        const corpus = `${quote.text} ${quote.saint} ${quote.tags.join(" ")} ${quote.source}`.toLowerCase();

        const queryMatch =
          tokens.length === 0
            ? true
            : exactPhrase
            ? corpus.includes(normalizedQuery)
            : tokens.every((token) => corpus.includes(token));

        const saintMatch = selectedSaint === "all" || quote.saint === selectedSaint;
        const monthMatch = selectedMonth === "all" || quote.feastMonth === Number(selectedMonth);
        const tagMatch = selectedTag === "all" || quote.tags.includes(selectedTag);
        const categoryMatch =
          selectedCategories.size === 0 || selectedCategories.has(quote.category);
        const lengthMatch =
          quote.text.length >= minLength && quote.text.length <= maxLength;
        const favoritesMatch = !favoritesOnly || favorites.has(quote.id);
        const readingListMatch = !readingListOnly || readingList.has(quote.id);
        const pinnedMatch = !pinnedOnly || (pinnedSaint !== "all" && quote.saint === pinnedSaint);

        return (
          queryMatch &&
          saintMatch &&
          monthMatch &&
          tagMatch &&
          categoryMatch &&
          lengthMatch &&
          favoritesMatch &&
          readingListMatch &&
          pinnedMatch
        );
      })
      .map((quote) => {
        let relevance = 0;

        if (normalizedQuery) {
          const lowerSaint = quote.saint.toLowerCase();
          const lowerText = quote.text.toLowerCase();

          if (lowerSaint.includes(normalizedQuery)) {
            relevance += 8;
          }

          if (lowerText.includes(normalizedQuery)) {
            relevance += 6;
          }

          for (const token of tokens) {
            if (lowerSaint.includes(token)) {
              relevance += 3;
            }
            if (lowerText.includes(token)) {
              relevance += 2;
            }
            if (quote.tags.some((tag) => tag.toLowerCase().includes(token))) {
              relevance += 1;
            }
          }
        }

        if (favorites.has(quote.id)) {
          relevance += 0.5;
        }

        return { quote, relevance };
      });

    const sorted = scored.sort((left, right) => {
      switch (sortMode) {
        case "saint-asc":
          return left.quote.saint.localeCompare(right.quote.saint);
        case "saint-desc":
          return right.quote.saint.localeCompare(left.quote.saint);
        case "length-asc":
          return left.quote.text.length - right.quote.text.length;
        case "length-desc":
          return right.quote.text.length - left.quote.text.length;
        case "month": {
          const leftMonth = left.quote.feastMonth ?? 13;
          const rightMonth = right.quote.feastMonth ?? 13;
          if (leftMonth !== rightMonth) {
            return leftMonth - rightMonth;
          }
          return left.quote.saint.localeCompare(right.quote.saint);
        }
        case "random": {
          return seededOrder(left.quote.id, randomSeed) - seededOrder(right.quote.id, randomSeed);
        }
        case "relevance":
        default:
          return right.relevance - left.relevance;
      }
    });

    return sorted.map((entry) => entry.quote);
  }, [
    categoryKey,
    exactPhrase,
    favorites,
    favoritesOnly,
    maxLength,
    minLength,
    pinnedOnly,
    pinnedSaint,
    query,
    randomSeed,
    readingList,
    readingListOnly,
    selectedCategories,
    selectedMonth,
    selectedSaint,
    selectedTag,
    sortMode,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginatedQuotes = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredQuotes.slice(start, start + pageSize);
  }, [filteredQuotes, pageSize, safePage]);

  const spotlightQuote = quoteById.get(spotlightQuoteId) ?? dailyQuote;

  const activeFiltersCount =
    (query.trim() ? 1 : 0) +
    (selectedSaint !== "all" ? 1 : 0) +
    (selectedMonth !== "all" ? 1 : 0) +
    (selectedTag !== "all" ? 1 : 0) +
    (selectedCategories.size > 0 ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (readingListOnly ? 1 : 0) +
    (pinnedOnly ? 1 : 0) +
    (minLength !== MIN_QUOTE_LENGTH || maxLength !== MAX_QUOTE_LENGTH ? 1 : 0);

  const visitedQuotes = recentViewed
    .map((id) => quoteById.get(id))
    .filter((quote): quote is Quote => Boolean(quote));

  const readingQueue = Array.from(readingList)
    .map((id) => quoteById.get(id))
    .filter((quote): quote is Quote => Boolean(quote));

  const randomizeSpotlight = () => {
    const source = filteredQuotes.length > 0 ? filteredQuotes : quotes;
    const random = source[Math.floor(Math.random() * source.length)];
    setSpotlightQuoteId(random.id);
    setRandomSeed(Date.now());
  };

  const toggleCategory = (category: QuoteCategory) => {
    setSelectedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleFavorite = (quoteId: number) => {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };

  const toggleReadingList = (quoteId: number) => {
    setReadingList((previous) => {
      const next = new Set(previous);
      if (next.has(quoteId)) {
        next.delete(quoteId);
      } else {
        next.add(quoteId);
      }
      return next;
    });
  };

  const updateNote = (quoteId: number, value: string) => {
    setNotes((previous) => ({
      ...previous,
      [quoteId]: value.slice(0, 280),
    }));
  };

  const trackViewedQuote = (quoteId: number) => {
    setRecentViewed((previous) => [quoteId, ...previous.filter((value) => value !== quoteId)].slice(0, 12));
  };

  const clearFilters = () => {
    setQuery("");
    setExactPhrase(false);
    setSelectedSaint("all");
    setSelectedMonth("all");
    setSelectedTag("all");
    setSelectedCategories(new Set());
    setFavoritesOnly(false);
    setReadingListOnly(false);
    setPinnedOnly(false);
    setMinLength(MIN_QUOTE_LENGTH);
    setMaxLength(MAX_QUOTE_LENGTH);
    setSortMode("relevance");
    setToast("Filters cleared");
  };

  const copyQuote = async (quote: Quote) => {
    try {
      await navigator.clipboard.writeText(buildShareText(quote));
      setToast("Quote copied to clipboard");
    } catch {
      setToast("Clipboard unavailable on this device");
    }
  };

  const shareQuote = async (quote: Quote) => {
    const shareText = buildShareText(quote);

    if (navigator.share) {
      try {
        await navigator.share({
          title: quote.saint,
          text: shareText,
        });
        setToast("Shared successfully");
        return;
      } catch {
        // User likely cancelled share dialog.
      }
    }

    await copyQuote(quote);
  };

  const exportData = () => {
    const payload: ExportPayload = {
      favorites: Array.from(favorites),
      readingList: Array.from(readingList),
      notes,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aeterna-backup-${formatTodayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Backup downloaded");
  };

  const triggerImport = () => {
    importInputRef.current?.click();
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ExportPayload>;

      if (Array.isArray(parsed.favorites)) {
        setFavorites(new Set(parsed.favorites.map((value) => Number(value)).filter(Number.isFinite)));
      }

      if (Array.isArray(parsed.readingList)) {
        setReadingList(
          new Set(parsed.readingList.map((value) => Number(value)).filter(Number.isFinite))
        );
      }

      if (parsed.notes && typeof parsed.notes === "object") {
        setNotes(
          Object.fromEntries(
            Object.entries(parsed.notes)
              .map(([key, value]) => [Number(key), String(value ?? "")])
              .filter(([key]) => Number.isFinite(key))
          )
        );
      }

      setToast("Backup imported");
    } catch {
      setToast("Import failed: invalid JSON backup");
    }
  };

  return (
    <div
      className={clsx(
        "relative min-h-screen overflow-hidden pb-24 text-stone-100",
        highContrast && "text-white"
      )}
      style={{ fontSize: `${fontScale}%` }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(224,190,141,0.26)_0%,rgba(10,10,10,0)_72%)]" />
        <div className="absolute bottom-0 left-0 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(112,82,46,0.24)_0%,rgba(10,10,10,0)_72%)]" />
        <div className="absolute right-0 top-24 h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(170,144,109,0.2)_0%,rgba(10,10,10,0)_70%)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-[1380px] flex-col gap-6 px-4 pt-6 md:px-8 md:pt-10">
        <section className="overflow-hidden rounded-[2rem] border border-white/15 bg-black/40 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-10">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200/30 bg-amber-100/10 px-3 py-1 text-xs tracking-[0.2em] text-amber-100/90">
                <Sparkles size={14} />
                AETERNA INTELLIGENCE
              </p>
              <h1 className="font-[family-name:var(--font-cormorant)] text-5xl leading-[0.9] text-white md:text-7xl">
                Ancient Wisdom,
                <br />
                Operational Clarity.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-300 md:text-base">
                A polished multi-layer quote engine with deep filters, favorites, reading queue, private notes,
                shortcuts, and high-fidelity browsing across saints, themes, and feast seasons.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 text-xs md:min-w-[240px]">
              <button
                type="button"
                onClick={randomizeSpotlight}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold tracking-wide text-amber-50 transition hover:bg-amber-300/20"
              >
                <Shuffle size={16} />
                Surprise Me
              </button>
              <button
                type="button"
                onClick={() => setFocusMode((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 transition hover:bg-white/10"
              >
                <Highlighter size={16} />
                {focusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
              </button>
              <button
                type="button"
                onClick={() => setHighContrast((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 transition hover:bg-white/10"
              >
                <SlidersHorizontal size={16} />
                {highContrast ? "Standard Contrast" : "High Contrast"}
              </button>
              <label className="rounded-xl border border-white/20 bg-white/5 px-4 py-2">
                Text Scale: {fontScale}%
                <input
                  type="range"
                  min={85}
                  max={130}
                  step={5}
                  value={fontScale}
                  onChange={(event) => setFontScale(Number(event.target.value))}
                  className="mt-2 w-full accent-amber-300"
                />
              </label>
              <div className="inline-flex items-center justify-between rounded-xl border border-white/20 bg-white/5 px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <Flame size={14} className="text-amber-300" />
                  Streak
                </span>
                <strong>{streak} days</strong>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/30 px-6 py-6 md:px-10">
            <div className="mb-2 text-xs uppercase tracking-[0.22em] text-amber-100/70">Daily Spotlight</div>
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="font-[family-name:var(--font-cormorant)] text-3xl leading-tight text-white md:text-4xl">
                  {highlightMatch(`"${spotlightQuote.text}"`, query)}
                </p>
                <p className="mt-3 text-sm uppercase tracking-[0.2em] text-stone-300">
                  {highlightMatch(spotlightQuote.saint, query)}
                  {spotlightQuote.feastDay ? ` - ${spotlightQuote.feastDay}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => toggleFavorite(spotlightQuote.id)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
                >
                  <Heart
                    size={14}
                    className={clsx(
                      "inline-block",
                      favorites.has(spotlightQuote.id) && "fill-rose-400 text-rose-400"
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => copyQuote(spotlightQuote)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
                >
                  <Copy size={14} className="inline-block" />
                </button>
                <button
                  type="button"
                  onClick={() => shareQuote(spotlightQuote)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
                >
                  <Share2 size={14} className="inline-block" />
                </button>
                <button
                  type="button"
                  onClick={randomizeSpotlight}
                  className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs transition hover:bg-amber-300/20"
                >
                  <Shuffle size={14} className="inline-block" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {!focusMode && (
          <section className="rounded-[1.6rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl md:p-6">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-3 text-stone-400" size={18} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by saint, quote text, keyword, or source..."
                  className="w-full rounded-xl border border-white/20 bg-black/45 py-3 pl-11 pr-4 text-sm text-white outline-none ring-0 transition placeholder:text-stone-400 focus:border-amber-300/55"
                />
                {recentSearches.length > 0 && query.length === 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {recentSearches.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setQuery(item)}
                        className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-stone-300 transition hover:border-amber-200/50 hover:text-amber-100"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={clsx(
                    "rounded-xl border px-3 py-2 transition",
                    viewMode === "grid"
                      ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                      : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                  )}
                >
                  <Grid2x2 size={14} className="mr-1 inline-block" /> Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={clsx(
                    "rounded-xl border px-3 py-2 transition",
                    viewMode === "list"
                      ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                      : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                  )}
                >
                  <List size={14} className="mr-1 inline-block" /> List
                </button>
                <button
                  type="button"
                  onClick={exportData}
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-stone-300 transition hover:bg-white/10"
                >
                  <Download size={14} className="mr-1 inline-block" /> Export
                </button>
                <button
                  type="button"
                  onClick={triggerImport}
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-stone-300 transition hover:bg-white/10"
                >
                  <Upload size={14} className="mr-1 inline-block" /> Import
                </button>
              </div>
            </div>

            <input
              ref={importInputRef}
              type="file"
              className="hidden"
              accept="application/json"
              onChange={onImport}
            />

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs">
                Saint
                <select
                  value={selectedSaint}
                  onChange={(event) => setSelectedSaint(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm"
                >
                  <option value="all">All saints</option>
                  {saintOptions.map((saint) => (
                    <option key={saint} value={saint}>
                      {saint}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs">
                Feast Month
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm"
                >
                  <option value="all">Any month</option>
                  {monthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs">
                Keyword Tag
                <select
                  value={selectedTag}
                  onChange={(event) => setSelectedTag(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm"
                >
                  <option value="all">All tags</option>
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>

              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs">
                Sort
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-2 py-2 text-sm"
                >
                  <option value="relevance">Relevance</option>
                  <option value="saint-asc">Saint A-Z</option>
                  <option value="saint-desc">Saint Z-A</option>
                  <option value="length-asc">Shortest first</option>
                  <option value="length-desc">Longest first</option>
                  <option value="month">Feast month</option>
                  <option value="random">Randomized order</option>
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-white/15 bg-black/40 p-3">
              <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-300">
                Categories
              </div>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((category) => {
                  const active = selectedCategories.has(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs transition",
                        active
                          ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                          : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-xs">
                Minimum quote length: {minLength}
                <input
                  type="range"
                  min={MIN_QUOTE_LENGTH}
                  max={MAX_QUOTE_LENGTH}
                  value={minLength}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMinLength(Math.min(next, maxLength - 6));
                  }}
                  className="mt-2 w-full accent-amber-300"
                />
              </label>

              <label className="rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-xs">
                Maximum quote length: {maxLength}
                <input
                  type="range"
                  min={MIN_QUOTE_LENGTH + 6}
                  max={MAX_QUOTE_LENGTH}
                  value={maxLength}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setMaxLength(Math.max(next, minLength + 6));
                  }}
                  className="mt-2 w-full accent-amber-300"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setExactPhrase((value) => !value)}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  exactPhrase
                    ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                    : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                )}
              >
                <Search size={12} className="mr-1 inline-block" />
                Exact phrase
              </button>

              <button
                type="button"
                onClick={() => setFavoritesOnly((value) => !value)}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  favoritesOnly
                    ? "border-rose-300/50 bg-rose-300/15 text-rose-100"
                    : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                )}
              >
                <Heart size={12} className="mr-1 inline-block" /> Favorites only
              </button>

              <button
                type="button"
                onClick={() => setReadingListOnly((value) => !value)}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  readingListOnly
                    ? "border-sky-300/50 bg-sky-300/15 text-sky-100"
                    : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                )}
              >
                <BookmarkPlus size={12} className="mr-1 inline-block" /> Reading list only
              </button>

              <button
                type="button"
                onClick={() => setPinnedOnly((value) => !value)}
                className={clsx(
                  "rounded-full border px-3 py-1 transition",
                  pinnedOnly
                    ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                    : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                )}
              >
                <Pin size={12} className="mr-1 inline-block" /> Pinned saint only
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-stone-300 transition hover:bg-white/10"
              >
                <Eraser size={12} className="mr-1 inline-block" /> Reset filters
              </button>

              <label className="ml-auto rounded-full border border-white/20 bg-white/5 px-3 py-1 text-stone-300">
                Page size
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="ml-2 bg-transparent"
                >
                  <option value={6}>6</option>
                  <option value={9}>9</option>
                  <option value={12}>12</option>
                </select>
              </label>
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_330px]">
          <div className="rounded-[1.4rem] border border-white/10 bg-black/35 p-4 backdrop-blur-xl md:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-stone-300">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1">
                <Filter size={12} /> Active filters: {activeFiltersCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1">
                <Star size={12} /> Library: {quotes.length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1">
                <Search size={12} /> Results: {filteredQuotes.length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1">
                <Heart size={12} /> Favorites: {favorites.size}
              </span>
            </div>

            <div
              className={clsx(
                "grid gap-3",
                viewMode === "grid" ? "md:grid-cols-2" : "grid-cols-1"
              )}
            >
              <AnimatePresence initial={false}>
                {paginatedQuotes.map((quote) => {
                  const isFavorite = favorites.has(quote.id);
                  const inReadingList = readingList.has(quote.id);
                  const isExpanded = expandedQuoteId === quote.id;

                  return (
                    <motion.article
                      key={quote.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className={clsx(
                        "group rounded-2xl border bg-black/40 p-4 transition",
                        highContrast ? "border-white/45" : "border-white/15",
                        isExpanded && "border-amber-300/45"
                      )}
                      onClick={() => {
                        trackViewedQuote(quote.id);
                        setExpandedQuoteId((value) => (value === quote.id ? null : quote.id));
                      }}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-stone-300">
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                          {quote.category}
                        </span>
                        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                          {quote.era}
                        </span>
                        {quote.feastDay && (
                          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                            {quote.feastDay}
                          </span>
                        )}
                      </div>

                      <p className="font-[family-name:var(--font-cormorant)] text-2xl leading-tight text-white">
                        {highlightMatch(`"${quote.text}"`, query)}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-300">
                        {highlightMatch(quote.saint, query)}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-1">
                        {quote.tags.map((tag) => (
                          <button
                            key={`${quote.id}-${tag}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTag(tag);
                            }}
                            className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[0.68rem] text-stone-300 transition hover:border-amber-300/45 hover:text-amber-100"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(quote.id);
                          }}
                          className={clsx(
                            "rounded-lg border px-2.5 py-1.5 transition",
                            isFavorite
                              ? "border-rose-300/40 bg-rose-300/15 text-rose-100"
                              : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                          )}
                        >
                          <Heart size={13} className={clsx("inline-block", isFavorite && "fill-rose-400")} />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleReadingList(quote.id);
                          }}
                          className={clsx(
                            "rounded-lg border px-2.5 py-1.5 transition",
                            inReadingList
                              ? "border-sky-300/45 bg-sky-300/15 text-sky-100"
                              : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                          )}
                        >
                          <BookmarkPlus size={13} className="inline-block" />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPinnedSaint(quote.saint);
                            setToast(`Pinned ${quote.saint}`);
                          }}
                          className={clsx(
                            "rounded-lg border px-2.5 py-1.5 transition",
                            pinnedSaint === quote.saint
                              ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                              : "border-white/20 bg-white/5 text-stone-300 hover:bg-white/10"
                          )}
                        >
                          <Pin size={13} className="inline-block" />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyQuote(quote);
                          }}
                          className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-stone-300 transition hover:bg-white/10"
                        >
                          <Copy size={13} className="inline-block" />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void shareQuote(quote);
                          }}
                          className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-stone-300 transition hover:bg-white/10"
                        >
                          <Share2 size={13} className="inline-block" />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 rounded-xl border border-white/15 bg-black/40 p-3">
                          <p className="text-xs text-stone-400">Source: {quote.source}</p>
                          <label className="mt-2 block text-xs text-stone-300">
                            Private note
                            <textarea
                              value={notes[quote.id] ?? ""}
                              onChange={(event) => updateNote(quote.id, event.target.value)}
                              rows={3}
                              placeholder="Write your reflection for this quote..."
                              className="mt-1 w-full resize-none rounded-md border border-white/20 bg-black/40 px-2 py-2 text-sm text-white outline-none focus:border-amber-300/45"
                              onClick={(event) => event.stopPropagation()}
                            />
                          </label>
                          <p className="mt-1 text-[0.68rem] text-stone-500">
                            {(notes[quote.id] ?? "").length}/280 chars
                          </p>
                        </div>
                      )}
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>

            {filteredQuotes.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-white/25 bg-black/35 p-6 text-center text-sm text-stone-300">
                No quotes matched. Try removing a filter or using a broader phrase.
              </div>
            )}

            {filteredQuotes.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-xs text-stone-300">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <p>
                  Page {safePage} / {totalPages}
                </p>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {!focusMode && (
            <aside className="space-y-4">
              <section className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
                <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-100">Recently Viewed</h2>
                {visitedQuotes.length === 0 ? (
                  <p className="text-sm text-stone-400">Open quotes to build your history.</p>
                ) : (
                  <div className="space-y-2">
                    {visitedQuotes.slice(0, 6).map((quote) => (
                      <button
                        key={`recent-${quote.id}`}
                        type="button"
                        onClick={() => {
                          setExpandedQuoteId(quote.id);
                          setSpotlightQuoteId(quote.id);
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left text-xs text-stone-300 transition hover:border-amber-300/35"
                      >
                        <p className="line-clamp-2 font-medium text-white">{quote.text}</p>
                        <p className="mt-1 text-[0.68rem] uppercase tracking-[0.16em] text-stone-400">
                          {quote.saint}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
                <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-100">Reading Queue</h2>
                {readingQueue.length === 0 ? (
                  <p className="text-sm text-stone-400">Bookmark quotes to read later.</p>
                ) : (
                  <div className="space-y-2">
                    {readingQueue.slice(0, 8).map((quote) => (
                      <button
                        key={`queue-${quote.id}`}
                        type="button"
                        onClick={() => {
                          setExpandedQuoteId(quote.id);
                          setSpotlightQuoteId(quote.id);
                          trackViewedQuote(quote.id);
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left text-xs text-stone-300 transition hover:border-amber-300/35"
                      >
                        <p className="line-clamp-2 font-medium text-white">{quote.text}</p>
                        <p className="mt-1 text-[0.68rem] uppercase tracking-[0.16em] text-stone-400">
                          {quote.saint}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl">
                <h2 className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-100">
                  Feature Matrix ({FEATURE_LEDGER.length})
                </h2>
                <ul className="max-h-64 space-y-1 overflow-auto pr-1 text-[0.72rem] text-stone-300">
                  {FEATURE_LEDGER.map((feature) => (
                    <li key={feature} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                      {feature}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.68rem] text-stone-400">
                  Shortcuts: / focus search, f favorites mode, r reshuffle, g view mode, esc clear search.
                </p>
              </section>
            </aside>
          )}
        </section>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-300/40 bg-black/85 px-4 py-2 text-xs text-amber-100 shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
