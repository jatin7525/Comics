"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, UserPlus, Flag } from "lucide-react";
import { requestJson, useMutation } from "./mutation";

export function SaveButton({
  id,
  saved,
  authenticated,
}: {
  id: string;
  saved: boolean;
  authenticated: boolean;
}) {
  const action = useMutation();
  if (!authenticated)
    return (
      <Link href="/login" className="secondary">
        <Bookmark size={16} />
        Sign in to save
      </Link>
    );
  return (
    <div>
      <button
        className="secondary"
        disabled={action.pending}
        onClick={() =>
          action.run(
            async () => {
              await requestJson(`/api/comics/${id}/save`, { enabled: !saved });
            },
            saved ? "Removed from library." : "Saved to your library.",
          )
        }
        aria-pressed={saved}
      >
        {saved ? <Check size={16} /> : <Bookmark size={16} />}
        {saved ? "Saved to library" : "Save to library"}
      </button>
      <p className="form-error" role="alert">
        {action.error}
      </p>
    </div>
  );
}
export function FollowButton({
  id,
  following,
  authenticated,
}: {
  id: string;
  following: boolean;
  authenticated: boolean;
}) {
  const action = useMutation();
  if (!authenticated)
    return (
      <Link className="secondary" href="/login">
        <UserPlus size={16} />
        Sign in to follow
      </Link>
    );
  return (
    <div>
      <button
        className="secondary"
        aria-pressed={following}
        disabled={action.pending}
        onClick={() =>
          action.run(async () => {
            await requestJson(`/api/creators/${id}/follow`, {
              enabled: !following,
            });
          })
        }
      >
        {following ? <Check size={16} /> : <UserPlus size={16} />}
        {following ? "Following" : "Follow creator"}
      </button>
      <p role="alert" className="form-error">
        {action.error}
      </p>
    </div>
  );
}
export function ProgressRecorder({
  comicId,
  page,
}: {
  comicId: string;
  page: number;
}) {
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/comics/${comicId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok)
          setError(
            "Reading progress could not be saved. You can keep reading.",
          );
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setError("Reading progress could not be saved.");
      });
    return () => controller.abort();
  }, [comicId, page]);
  return error ? (
    <p role="status" className="muted">
      {error}
    </p>
  ) : null;
}
export function ReportForm({
  comicId,
  authenticated,
}: {
  comicId: string;
  authenticated: boolean;
}) {
  const action = useMutation();
  if (!authenticated)
    return (
      <Link className="text-link" href="/login">
        Sign in to report a concern
      </Link>
    );
  return (
    <details className="report-details">
      <summary>
        <Flag size={14} />
        Report this publication
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void action.run(async () => {
            await requestJson(`/api/comics/${comicId}/report`, {
              reason: form.get("reason"),
            });
          }, "Your report was sent to the moderation team.");
        }}
      >
        <label className="field">
          Describe your concern
          <textarea
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            placeholder="Explain the rights, rating, or content concern."
          />
        </label>
        <button className="secondary" disabled={action.pending}>
          Send report
        </button>
        <p role="alert" className="form-error">
          {action.error}
        </p>
        <p role="status" className="form-success">
          {action.success}
        </p>
      </form>
    </details>
  );
}
