"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { chapterForPage, type ChapterRange } from "@/domain/chapters";
import type { AccessModel } from "@/domain/models";
import { ChapterComments } from "./chapter-comments";

// Mirrors WHOLE_COMIC_THREAD in domain/validation without bundling zod on the client.
const WHOLE_COMIC_THREAD = "comic";

export interface ReaderPage {
  number: number;
  alt: string;
}
type Gate = "login_required" | "payment_required" | null;
export interface PageBatch {
  pages: ReaderPage[];
  gate: Gate;
  gatePage: number | null;
  nextFrom: number | null;
  version: number;
}
const BATCH = 4;

export function ReaderScroller({
  comic,
  chapters,
  initial,
  authenticated,
}: {
  comic: {
    id: string;
    slug: string;
    pageCount: number;
    access: AccessModel;
  };
  chapters: ChapterRange[];
  initial: PageBatch;
  authenticated: boolean;
}) {
  const router = useRouter();
  const [pages, setPages] = useState(initial.pages);
  const [gate, setGate] = useState({
    reason: initial.gate,
    page: initial.gatePage,
  });
  const [nextFrom, setNextFrom] = useState(initial.nextFrom);
  const [loading, setLoading] = useState<"next" | "previous" | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(
    initial.pages[0]?.number ?? initial.gatePage ?? 1,
  );
  const sentinel = useRef<HTMLDivElement>(null);
  const figures = useRef(new Map<number, HTMLElement>());
  const recorded = useRef(0);
  const first = pages[0]?.number ?? gate.page ?? 1;
  const chapter = chapterForPage(chapters, current);
  const chapterIndex = chapter ? chapter.number - 1 : -1;

  const load = useCallback(
    async (direction: "next" | "previous") => {
      if (loading) return;
      const from = direction === "next" ? nextFrom : Math.max(1, first - BATCH);
      if (!from || (direction === "previous" && first <= 1)) return;
      const limit = direction === "next" ? BATCH : first - from;
      setLoading(direction);
      setError("");
      try {
        const response = await fetch(
          `/api/comics/${comic.id}/pages?from=${from}&limit=${limit}`,
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error?.message ?? "Pages could not be loaded.");
        const batch = data as PageBatch;
        if (direction === "next") {
          setPages((existing) => [...existing, ...batch.pages]);
          setNextFrom(batch.nextFrom);
          setGate({ reason: batch.gate, page: batch.gatePage });
        } else
          setPages((existing) => [
            ...batch.pages.filter((page) => page.number < first),
            ...existing,
          ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Pages could not be loaded.");
      } finally {
        setLoading(null);
      }
    },
    [comic.id, first, loading, nextFrom],
  );

  // Pagination on scroll: fetch the next batch well before the reader reaches the end.
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !nextFrom || gate.reason || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load("next");
      },
      { rootMargin: "1500px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [error, gate.reason, load, nextFrom]);

  // The page crossing the middle of the viewport is the one being read.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setCurrent(Number((entry.target as HTMLElement).dataset.page));
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    figures.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pages]);

  // Keep the address shareable and resumable without a navigation.
  useEffect(() => {
    const path = `/read/${comic.slug}/${current}`;
    if (window.location.pathname !== path)
      window.history.replaceState(window.history.state, "", path);
  }, [comic.slug, current]);

  useEffect(() => {
    if (!authenticated || recorded.current === current) return;
    const timer = setTimeout(() => {
      recorded.current = current;
      void fetch(`/api/comics/${comic.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: current }),
      }).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [authenticated, comic.id, current]);

  function goTo(page: number) {
    const element = figures.current.get(page);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
    else router.push(`/read/${comic.slug}/${page}`);
  }
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1
      ? chapters[chapterIndex + 1]
      : null;
  const chapterStarts = new Map(chapters.map((item) => [item.startPage, item]));
  const chapterEnds = new Map(chapters.map((item) => [item.endPage, item]));
  // Each chapter's discussion follows its last page; comics without chapters have one thread.
  function commentsAfter(pageNumber: number) {
    const ending = chapterEnds.get(pageNumber);
    if (ending)
      return {
        chapterId: ending.id,
        label: `Chapter ${ending.number}`,
      };
    return !chapters.length && pageNumber === comic.pageCount
      ? { chapterId: WHOLE_COMIC_THREAD, label: "this comic" }
      : null;
  }

  return (
    <div className="reader-scroller">
      <div className="reader-toolbar" role="toolbar" aria-label="Reading">
        {chapters.length > 0 && (
          <>
            <button
              type="button"
              className="secondary"
              disabled={!previousChapter}
              onClick={() => previousChapter && goTo(previousChapter.startPage)}
              aria-label="Previous chapter"
            >
              <ChevronLeft size={16} />
              <span>Previous</span>
            </button>
            <label className="reader-chapter-select">
              <span className="sr-only">Chapter</span>
              <select
                value={chapter?.id ?? ""}
                onChange={(event) => {
                  const target = chapters.find(
                    (item) => item.id === event.target.value,
                  );
                  if (target) goTo(target.startPage);
                }}
              >
                {chapters.map((item) => (
                  <option key={item.id} value={item.id}>
                    Chapter {item.number}: {item.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!nextChapter}
              onClick={() => nextChapter && goTo(nextChapter.startPage)}
              aria-label="Next chapter"
            >
              <span>Next</span>
              <ChevronRight size={16} />
            </button>
          </>
        )}
        <span className="reader-position" aria-live="polite">
          Page {current} of {comic.pageCount}
        </span>
      </div>

      {first > 1 && (
        <button
          type="button"
          className="secondary reader-earlier"
          disabled={!!loading}
          onClick={() => void load("previous")}
        >
          {loading === "previous" ? "Loading…" : "Show earlier pages"}
        </button>
      )}

      {pages.map((page, index) => {
        const starts = chapterStarts.get(page.number);
        return (
          <section
            key={page.number}
            className="reader-page-block"
            data-page={page.number}
            ref={(element) => {
              if (element) figures.current.set(page.number, element);
              else figures.current.delete(page.number);
            }}
          >
            {starts && (
              <h2 className="reader-chapter-divider">
                Chapter {starts.number} · {starts.title}
              </h2>
            )}
            <img
              className="reading-page"
              src={`/api/comics/${comic.id}/media/${page.number}?v=${initial.version}`}
              alt={page.alt}
              width={900}
              height={1000}
              loading={index < 2 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={index === 0 ? "high" : undefined}
            />
            {(() => {
              const thread = commentsAfter(page.number);
              return thread ? (
                <ChapterComments
                  key={thread.chapterId}
                  comicId={comic.id}
                  chapterId={thread.chapterId}
                  label={thread.label}
                  authenticated={authenticated}
                  loginHref={`/login?next=${encodeURIComponent(`/read/${comic.slug}/${page.number}`)}`}
                />
              ) : null;
            })()}
          </section>
        );
      })}

      <div ref={sentinel} aria-hidden="true" />
      {loading === "next" && (
        <p className="muted reader-status" role="status">
          Loading more pages…
        </p>
      )}
      {error && (
        <div className="notice reader-status" role="alert">
          {error}{" "}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError("");
              void load("next");
            }}
          >
            Try again
          </button>
        </div>
      )}

      {gate.reason && (
        <div className="gate">
          <LockKeyhole size={30} />
          <h2>The story is just getting started.</h2>
          <p>
            {pages.length
              ? "You’ve reached the end of the free preview."
              : `Page ${gate.page} is not part of the free preview.`}
          </p>
          {gate.reason === "login_required" ? (
            <>
              <p>
                Sign in to continue free titles. Premium titles also require the
                corresponding membership or purchase.
              </p>
              <Link
                className="primary"
                href={`/login?next=${encodeURIComponent(`/read/${comic.slug}/${gate.page}`)}`}
              >
                Sign in to continue
              </Link>
            </>
          ) : (
            <>
              <p>
                {comic.access === "purchase"
                  ? "This comic requires an individual purchase. Membership does not include it."
                  : "This comic requires an active membership or an eligible purchase."}
              </p>
              <div className="notice">
                Payments are coming later. This title cannot be purchased yet.
              </div>
              <Link href="/comics?access=free" className="primary">
                Explore free comics
              </Link>
            </>
          )}
        </div>
      )}

      {!gate.reason && !nextFrom && pages.length > 0 && (
        <div className="reader-end">
          <p>You’ve reached the end.</p>
          <Link className="primary" href="/comics">
            Find your next story
          </Link>
        </div>
      )}
    </div>
  );
}
