"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJson } from "./mutation";

export function AuthForm({
  mode,
  next = "/",
}: {
  mode: "login" | "register";
  next?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/auth/${mode}`, {
        email: form.get("email"),
        password: form.get("password"),
        ...(mode === "register" ? { name: form.get("name") } : {}),
      });
      const target =
        next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
          ? next
          : "/";
      router.push(target);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-card">
      <span className="tag">Your reading space</span>
      <h1>
        {mode === "register"
          ? "Your next chapter starts here."
          : "Welcome back."}
      </h1>
      <p>
        {mode === "register"
          ? "Save stories, follow creators, and read every free comic."
          : "Pick up where your imagination left off."}
      </p>
      <form onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            Your name
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={60}
            />
          </label>
        )}
        <label className="field">
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        {mode === "register" && (
          <p className="muted">
            Use at least 12 characters. New accounts are readers; publishing
            access is granted by an administrator.
          </p>
        )}
        <p role="alert" className="form-error">
          {error}
        </p>
        <button className="primary full-width" disabled={pending}>
          {pending
            ? "Please wait…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      <Link
        className="text-link"
        href={
          mode === "register"
            ? `/login?next=${encodeURIComponent(next)}`
            : `/register?next=${encodeURIComponent(next)}`
        }
      >
        {mode === "register"
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </Link>
    </div>
  );
}
