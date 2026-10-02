import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { CreateLink } from "@/components/app-shell";
import { BillingNotice, Intro, Stats } from "@/components/ui";
import { PublicationTable } from "@/components/publication-table";
import Link from "next/link";
export default async function StudioSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const user = await requireUser(["author", "admin"]);
  const { section } = await params;
  if (
    ![
      "publications",
      "art",
      "analytics",
      "earnings",
      "audience",
      "settings",
    ].includes(section)
  )
    notFound();
  const services = getServices();
  if (section === "publications" || section === "art") {
    const items = await services.publications.byAuthor(user.id);
    return (
      <>
        <Intro
          title={
            section === "art" ? "Your art portfolio." : "Your publications."
          }
          description="Draft, refine, and publish work you’re proud of. Showing the latest 50 publications."
          action={<CreateLink />}
        />
        <section className="panel">
          <PublicationTable
            publications={
              section === "art"
                ? items.filter((p) => p.kind === "artwork")
                : items
            }
          />
        </section>
      </>
    );
  }
  if (section === "earnings")
    return (
      <>
        <Intro
          title="Your earnings."
          description="A clear view of creator compensation, when payments launch."
        />
        <BillingNotice />
        <div className="panel">
          <h2>No financial activity yet</h2>
          <p className="muted">
            Purchases, membership allocation, ad earnings, and payouts will
            appear here after the billing integration. No earnings are estimated
            or fabricated.
          </p>
        </div>
      </>
    );
  if (section === "settings")
    return (
      <>
        <Intro
          title="Studio account."
          description="Your publishing identity and permissions."
        />
        <section className="panel">
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <p className="muted">
            You can manage your own publications. The editorial team controls
            publishing authorization.
          </p>
          <Link className="secondary" href="/account">
            View account
          </Link>
        </section>
      </>
    );
  const metrics = await services.community.metrics(user.id);
  return (
    <>
      <Intro
        title={
          section === "analytics"
            ? "Understand your readership."
            : "The people behind the page views."
        }
        description="Measured from saved reading progress and creator follows. Guest reads are not tracked."
      />
      <Stats
        values={[
          {
            label: "Signed-in readers",
            value: metrics.readers,
            detail: "Distinct accounts that recorded progress",
          },
          {
            label: "Followers",
            value: metrics.followers,
            detail: "Readers following your publications",
          },
          {
            label: "Published titles",
            value: metrics.published,
            detail: "Comics and artwork",
          },
          {
            label: "Drafts",
            value: metrics.drafts,
            detail: "Your work in progress",
          },
        ]}
      />
      <div className="notice">
        These are database-backed counts. Event timelines, retention cohorts,
        and qualified read metrics will need an asynchronous analytics pipeline
        before high-volume use.
      </div>
    </>
  );
}
