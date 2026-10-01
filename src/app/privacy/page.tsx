import { Intro } from "@/components/ui";
export default function Privacy() {
  return (
    <>
      <Intro
        title="Your reading space is personal."
        description="How this development application uses data."
      />
      <article className="panel prose">
        <p>
          Accounts, hashed passwords, hashed session tokens, saved publications,
          followed creators, reports, and reading progress are stored in
          MongoDB. Comic files are stored separately in private object storage.
        </p>
        <p>
          A session cookie keeps you signed in. Theme preferences are stored in
          your browser. No payment details are collected. No third-party
          advertising or behavior analytics are active. The interface may
          request fonts from Google Fonts.
        </p>
        <p>
          Administrative changes are recorded in an audit log. Rate-limit
          identifiers are hashed. Contact the operator for account-data
          requests; self-service account deletion and a complete production
          privacy policy are not yet available.
        </p>
      </article>
    </>
  );
}
