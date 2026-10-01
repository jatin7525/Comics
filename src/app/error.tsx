"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please try again. Your saved stories and publications are still in your
        account.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
