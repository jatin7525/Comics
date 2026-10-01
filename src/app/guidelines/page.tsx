import { Intro } from "@/components/ui";
export default function Guidelines() {
  return (
    <>
      <Intro
        title="Make this a good place for stories."
        description="Our publishing and community principles."
      />
      <article className="panel prose">
        <h2>Publish work you have rights to share</h2>
        <p>
          Confirm ownership or permission before submitting. Label age ratings
          accurately and provide readable page descriptions. Do not upload
          exploitative content, harassment, hateful material, or deceptive
          metadata.
        </p>
        <h2>Respect the people behind the work</h2>
        <p>
          Do not redistribute paid pages or impersonate creators. Report rights
          and content concerns from the publication page so the editorial team
          can review them.
        </p>
        <h2>Review and feedback</h2>
        <p>
          Submissions are reviewed before publication. Authors receive feedback
          when changes are needed. Contact the operator to request review of a
          moderation decision.
        </p>
        <p className="muted">
          These are working product guidelines. Full legal terms and an
          operational appeals process are required before public commercial
          launch.
        </p>
      </article>
    </>
  );
}
