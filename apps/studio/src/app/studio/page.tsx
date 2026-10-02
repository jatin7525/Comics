import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { CreateLink } from "@/components/app-shell";
import { Intro, Stats } from "@/components/ui";
import { PublicationTable } from "@/components/publication-table";
export default async function Studio() {
  const user = await requireUser(["author", "admin"]);
  const services = getServices();
  const [metrics, publications] = await Promise.all([
    services.community.metrics(user.id),
    services.publications.byAuthor(user.id),
  ]);
  return (
    <>
      <Intro
        title="Your stories are finding their people."
        description={`Welcome back, ${user.name}. Your publishing space, at a glance.`}
        action={<CreateLink />}
      />
      <Stats
        values={[
          {
            label: "Published work",
            value: metrics.published,
            detail: "Comics and artwork",
          },
          {
            label: "Drafts",
            value: metrics.drafts,
            detail: "Ready when you are",
          },
          {
            label: "Awaiting review",
            value: metrics.submitted,
            detail: "With the editorial team",
          },
          {
            label: "Readers",
            value: metrics.readers,
            detail: "Accounts with saved reading progress",
          },
        ]}
      />
      <div className="notice">
        Your work remains yours. Confirm publishing rights, choose an age
        rating, and submit completed pages for review before they go live.
      </div>
      <section className="panel">
        <h2>Your publications</h2>
        <PublicationTable publications={publications.slice(0, 8)} />
      </section>
    </>
  );
}
