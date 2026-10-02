"use client";
import { requestJson, useMutation } from "./mutation";
import type { Role } from "@/domain/models";

export function ReviewForm({
  id,
  version,
  reviewable,
}: {
  id: string;
  version: number;
  reviewable: boolean;
}) {
  const action = useMutation();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(async () => {
          await requestJson(`/api/admin/reviews/${id}`, {
            version,
            decision: form.get("decision"),
            note: form.get("note"),
          });
        }, "Review decision saved.");
      }}
    >
      <h2>Editorial decision</h2>
      <fieldset disabled={!reviewable || action.pending}>
        <label className="field">
          Decision
          <select name="decision">
            <option value="published">Approve and publish</option>
            <option value="changes_requested">Request changes</option>
            <option value="rejected">Reject submission</option>
          </select>
        </label>
        <label className="field">
          Editorial feedback
          <textarea
            name="note"
            maxLength={1000}
            placeholder="Required for changes or rejection. Explain what the creator should address."
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" required />I have reviewed all pages,
          publishing rights, age rating, and community guidelines.
        </label>
        <button className="primary" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save decision"}
        </button>
      </fieldset>
      {!reviewable && (
        <p className="muted">
          This publication is no longer awaiting review, or you are its author.
        </p>
      )}
      <p role="alert" className="form-error">
        {action.error}
      </p>
      <p role="status" className="form-success">
        {action.success}
      </p>
    </form>
  );
}
export function ReleaseReviewForm({
  id,
  version,
  reviewable,
}: {
  id: string;
  version: number;
  reviewable: boolean;
}) {
  const action = useMutation();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(async () => {
          await requestJson(`/api/admin/releases/${id}`, {
            version,
            decision: form.get("decision"),
            note: form.get("note"),
          });
        }, "Chapter decision saved.");
      }}
    >
      <h2>New chapter decision</h2>
      <fieldset disabled={!reviewable || action.pending}>
        <label className="field">
          Decision
          <select name="decision">
            <option value="approved">Approve and publish chapter</option>
            <option value="changes_requested">Request changes</option>
          </select>
        </label>
        <label className="field">
          Editorial feedback
          <textarea
            name="note"
            maxLength={1000}
            placeholder="Required when requesting changes."
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" required />I have reviewed every new page
          against the comic’s age rating and community guidelines.
        </label>
        <button className="primary" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save decision"}
        </button>
      </fieldset>
      {!reviewable && (
        <p className="muted">
          This chapter is no longer awaiting review, or you are its author.
        </p>
      )}
      <p role="alert" className="form-error">
        {action.error}
      </p>
      <p role="status" className="form-success">
        {action.success}
      </p>
    </form>
  );
}
export function HideForm({ id, version }: { id: string; version: number }) {
  const action = useMutation();
  return (
    <details className="admin-details">
      <summary>Unpublish</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void action.run(async () => {
            await requestJson(`/api/admin/content/${id}`, {
              version,
              reason: form.get("reason"),
            });
          }, "Publication hidden from the catalog.");
        }}
      >
        <label className="field">
          Reason
          <textarea name="reason" required minLength={10} maxLength={500} />
        </label>
        <p className="muted">
          This removes public and reader access. Review existing paid
          entitlements before using this operation once billing is introduced.
        </p>
        <button className="secondary" disabled={action.pending}>
          Confirm unpublish
        </button>
        <p role="alert" className="form-error">
          {action.error}
        </p>
      </form>
    </details>
  );
}
export function UserAccessForm({
  id,
  role,
  status,
}: {
  id: string;
  role: Role;
  status: "active" | "suspended";
}) {
  const action = useMutation();
  if (role === "admin")
    return <span className="tag">Protected administrator</span>;
  return (
    <details className="admin-details">
      <summary>Manage access</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void action.run(async () => {
            await requestJson(
              `/api/admin/users/${id}`,
              {
                role: form.get("role"),
                status: form.get("status"),
                reason: form.get("reason"),
              },
              "PATCH",
            );
          }, "Access updated. Existing sessions have been revoked.");
        }}
      >
        <label className="field">
          Role
          <select name="role" defaultValue={role}>
            <option value="reader">Reader</option>
            <option value="author">Authorized author</option>
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="field">
          Reason
          <textarea name="reason" minLength={10} maxLength={500} required />
        </label>
        <button className="secondary" disabled={action.pending}>
          Save access
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
export function PolicyForm({
  adsEnabled,
  submissionsEnabled,
  siteName,
}: {
  adsEnabled: boolean;
  submissionsEnabled: boolean;
  siteName: string;
}) {
  const action = useMutation();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(async () => {
          await requestJson(
            "/api/admin/policies",
            {
              adsEnabled: form.get("adsEnabled") === "on",
              submissionsEnabled: form.get("submissionsEnabled") === "on",
              siteName: String(form.get("siteName") ?? "").trim(),
            },
            "PATCH",
          );
        }, "Platform policy saved and audited.");
      }}
    >
      <h2>Platform controls</h2>
      <label className="field">
        Site name
        <input
          name="siteName"
          required
          minLength={2}
          maxLength={40}
          defaultValue={siteName}
        />
      </label>
      <p className="muted">
        Shown in the logo, page titles, footer and the Originals label across
        Reader, Studio and Admin.
      </p>
      <label className="policy-row">
        <div>
          <strong>Accept new submissions</strong>
          <p>
            Authors can continue saving drafts while submissions are paused.
          </p>
        </div>
        <input
          className="switch-input"
          type="checkbox"
          name="submissionsEnabled"
          defaultChecked={submissionsEnabled}
        />
      </label>
      <label className="policy-row">
        <div>
          <strong>Show the discovery promotion</strong>
          <p>
            Controls the house promotion slot. No external ad network is
            connected.
          </p>
        </div>
        <input
          className="switch-input"
          type="checkbox"
          name="adsEnabled"
          defaultChecked={adsEnabled}
        />
      </label>
      <div className="policy-row">
        <div>
          <strong>Rights declaration and editorial review</strong>
          <p>
            Mandatory for every publication. These safeguards cannot be disabled
            through the UI.
          </p>
        </div>
        <span className="status green">Always required</span>
      </div>
      <button className="primary" disabled={action.pending}>
        Save controls
      </button>
      <p role="alert" className="form-error">
        {action.error}
      </p>
      <p role="status" className="form-success">
        {action.success}
      </p>
    </form>
  );
}
export function ResolveReportForm({ id }: { id: string }) {
  const action = useMutation();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(async () => {
          await requestJson(`/api/admin/reports/${id}`, {
            reason: form.get("reason"),
          });
        }, "Report resolved.");
      }}
    >
      <label className="field">
        Resolution note
        <textarea name="reason" required minLength={10} maxLength={1000} />
      </label>
      <button className="secondary" disabled={action.pending}>
        Resolve report
      </button>
      <p role="alert" className="form-error">
        {action.error}
      </p>
    </form>
  );
}
