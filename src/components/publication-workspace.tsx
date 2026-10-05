"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  FileImage,
  Settings,
  ListTree,
  Plus,
  BadgeIndianRupee,
  ClipboardCheck,
} from "lucide-react";
import { PublicationEditor, type EditorData } from "./publication-editor";
import { PublicationMedia } from "./publication-media";
import { ChapterEditor } from "./chapter-editor";
import { ChapterReleasePanel } from "./chapter-release";
import { requestJson } from "./mutation";
import { Status } from "./ui";

type Section =
  "pages" | "details" | "cover" | "chapters" | "release" | "access" | "review";
export function PublicationWorkspace({
  publication,
}: {
  publication: EditorData;
}) {
  const [draft, setDraft] = useState(publication);
  const [section, setSection] = useState<Section>(
    publication.kind === "comic" ? "pages" : "cover",
  );
  const [chapterId, setChapterId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  function saved(value: EditorData) {
    setDraft(value);
    setDirty(false);
  }
  function navigate(next: Section, chapter = "") {
    if (
      busy ||
      (dirty &&
        !window.confirm("Leave this section and discard unsaved changes?"))
    )
      return;
    setSection(next);
    setChapterId(chapter);
    setDirty(false);
    setError("");
  }
  async function reload() {
    const response = await fetch(`/api/publications/${draft.id}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message ?? "Could not reload this comic.");
    saved(data);
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }
  const editable = ["draft", "changes_requested", "published"].includes(
    draft.status,
  );
  const structureEditable =
    editable && !(draft.status === "published" && draft.release);
  const tabs = [
    ...(draft.kind === "comic"
      ? [
          { id: "pages" as const, label: "Pages", Icon: BookOpen },
          {
            id: "chapters" as const,
            label: "Chapter structure",
            Icon: ListTree,
          },
        ]
      : []),
    { id: "details" as const, label: "Comic details", Icon: Settings },
    {
      id: "cover" as const,
      label: draft.kind === "comic" ? "Cover" : "Artwork",
      Icon: FileImage,
    },
    { id: "access" as const, label: "Access & price", Icon: BadgeIndianRupee },
    ...(draft.kind === "comic" && draft.status === "published"
      ? [{ id: "release" as const, label: "New chapter", Icon: Plus }]
      : []),
    { id: "review" as const, label: "Review & manage", Icon: ClipboardCheck },
  ];
  return (
    <section className="comic-management">
      <header className="comic-management-header">
        <div>
          <Link className="text-link" href="/studio/publications">
            My publications
          </Link>
          <h1>{draft.title}</h1>
          <p>
            {draft.kind === "comic"
              ? `${draft.chapters?.length || 1} chapters · ${draft.pageCount} pages`
              : "Artwork"}
          </p>
        </div>
        <Status value={draft.status} />
      </header>
      {draft.status === "published" && (
        <p className="notice">
          You’re editing a live publication. Saved edits appear immediately; new
          chapter releases go through review.
        </p>
      )}
      {!editable && (
        <p className="notice">
          This publication is {draft.status.replaceAll("_", " ")}. Editing is
          locked until editorial review allows changes.
        </p>
      )}
      <nav
        className="comic-management-tabs"
        aria-label="Publication management"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            aria-current={section === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className={section === "pages" ? "comic-management-grid" : ""}>
        {section === "pages" && (
          <aside
            className="comic-chapter-index"
            aria-label="Choose chapter to edit"
          >
            <h2>Chapters</h2>
            <button
              disabled={busy}
              aria-current={!chapterId ? "page" : undefined}
              onClick={() => navigate("pages")}
            >
              All pages <span>{draft.pageCount}</span>
            </button>
            {draft.chapters?.map((chapter, index) => {
              const end =
                (draft.chapters![index + 1]?.startPage ?? draft.pageCount + 1) -
                1;
              return (
                <button
                  key={chapter.id}
                  disabled={busy}
                  aria-current={chapterId === chapter.id ? "page" : undefined}
                  onClick={() => navigate("pages", chapter.id)}
                >
                  <strong>
                    {index + 1}. {chapter.title}
                  </strong>
                  <small>
                    Pages {chapter.startPage}–{end}
                  </small>
                </button>
              );
            })}
            <Link
              className="text-link"
              href={`/studio/publications/${draft.id}/chapters/${chapterId || draft.chapters?.[0]?.id || "all"}`}
            >
              Open dedicated chapter editor ↗
            </Link>
            {draft.release && (
              <Link
                className="text-link"
                href={`/studio/publications/${draft.id}/chapters/${draft.release.id}`}
              >
                Edit unpublished chapter ↗
              </Link>
            )}
            <button
              className="text-link"
              disabled={busy}
              onClick={() => navigate("chapters")}
            >
              Manage chapter names & order
            </button>
          </aside>
        )}
        <div
          className="comic-management-content"
          onChangeCapture={() => setDirty(true)}
        >
          {(section === "pages" || section === "cover") && (
            <section className="panel">
              <PublicationMedia
                key={`${section}-${chapterId}`}
                publication={draft}
                onChange={saved}
                onBusy={setBusy}
                mode={section}
                chapterId={chapterId || undefined}
              />
            </section>
          )}
          {section === "chapters" && (
            <section className="panel">
              <h2>Chapter structure</h2>
              <p>
                Rename chapters and choose where each begins. To edit its images
                or text, select the chapter in Pages.
              </p>
              {!structureEditable && (
                <p className="notice">
                  Chapter structure is locked during review or while a new
                  chapter is in preparation.
                </p>
              )}
              <ChapterEditor
                key={draft.version}
                publication={draft}
                busy={busy}
                editable={structureEditable}
                onSave={(chapters) =>
                  run(async () => {
                    await requestJson(
                      `/api/publications/${draft.id}/chapters`,
                      { version: draft.version, chapters },
                      "PUT",
                    );
                    await reload();
                  })
                }
                onDelete={
                  structureEditable
                    ? (chapter) =>
                        run(async () => {
                          await requestJson(
                            `/api/publications/${draft.id}/chapters/${chapter}`,
                            { version: draft.version },
                            "DELETE",
                          );
                          await reload();
                        })
                    : undefined
                }
              />
            </section>
          )}
          {section === "release" && (
            <section className="panel">
              <ChapterReleasePanel
                key={draft.release?.id ?? "new"}
                publication={draft}
                busy={busy}
                run={run}
                reload={reload}
              />
            </section>
          )}
          {(["details", "access", "review"] as Section[]).includes(section) && (
            <PublicationEditor
              key={`${section}-${draft.version}`}
              publication={draft}
              managementStep={
                section === "details" ? 0 : section === "access" ? 2 : 3
              }
              onSaved={saved}
              onBusy={setBusy}
            />
          )}
          <p className="form-error" role="alert">
            {error}
          </p>
        </div>
      </div>
    </section>
  );
}
