"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export async function requestJson<T>(
  url: string,
  body: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message ?? "The request failed. Please try again.",
    );
  return data as T;
}
export function useMutation() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function run(task: () => Promise<void>, message = "Saved.") {
    if (pending || refreshing) return;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      await task();
      setSuccess(message);
      startTransition(() => router.refresh());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return { pending: pending || refreshing, error, success, run };
}
