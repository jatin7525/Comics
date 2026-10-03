"use client";
import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Trash2 } from "lucide-react";
import { requestJson } from "./mutation";

interface CommentItem {
  id: string;
  userName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
  byAuthor: boolean;
}

export function ChapterComments({
  comicId,
  chapterId,
  label,
  authenticated,
  loginHref,
}: {
  comicId: string;
  chapterId: string;
  label: string;
  authenticated: boolean;
  loginHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/comics/${comicId}/comments`;

  async function load(next?: string) {
    const params = new URLSearchParams({ chapter: chapterId });
    if (next) params.set("cursor", next);
    const response = await fetch(`${base}?${params}`);
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message ?? "Comments could not be loaded.");
    setItems((current) => (next ? [...current, ...data.items] : data.items));
    setTotal(data.total);
    setCursor(data.nextCursor);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <div className="chapter-comments">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setOpen(true);
            void run(() => load());
          }}
        >
          <MessageCircle size={16} />
          Comments on {label}
        </button>
      </div>
    );

  return (
    <section
      className="chapter-comments panel"
      aria-label={`Comments on ${label}`}
    >
      <h3>
        Comments on {label}
        {total !== null && <span className="muted"> · {total}</span>}
      </h3>
      {authenticated ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await requestJson(base, { chapterId, body });
              setBody("");
              await load();
            });
          }}
        >
          <label className="field">
            <span className="sr-only">Your comment</span>
            <textarea
              value={body}
              maxLength={1000}
              rows={3}
              required
              disabled={busy}
              placeholder="What did you think of this chapter?"
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <button className="primary" disabled={busy || !body.trim()}>
            Post comment
          </button>
        </form>
      ) : (
        <p>
          <Link className="text-link" href={loginHref}>
            Sign in to join the conversation
          </Link>
        </p>
      )}
      <p role="alert" className="form-error">
        {error}
      </p>
      {total === 0 && <p className="muted">No comments yet. Be the first.</p>}
      <ul className="comment-list">
        {items.map((comment) => (
          <li key={comment.id}>
            <div className="comment-meta">
              <strong>{comment.userName}</strong>
              {comment.byAuthor && <span className="tag">Author</span>}
              <time className="muted" dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
              {comment.canDelete && (
                <button
                  type="button"
                  className="comment-delete"
                  disabled={busy}
                  aria-label={`Delete comment by ${comment.userName}`}
                  onClick={() => {
                    if (!window.confirm("Delete this comment?")) return;
                    void run(async () => {
                      await requestJson(`${base}/${comment.id}`, {}, "DELETE");
                      await load();
                    });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <p className="comment-body">{comment.body}</p>
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void run(() => load(cursor))}
        >
          Show older comments
        </button>
      )}
    </section>
  );
}
