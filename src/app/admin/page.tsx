import Link from "next/link";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { Intro, Stats } from "@/components/ui";
import { PublicationTable } from "@/components/publication-table";
export default async function Admin() {
  await requireUser(["admin"]);
  const services = getServices();
  const [metrics, queue, reports] = await Promise.all([
    services.community.metrics(),
    services.administration.reviewQueue(),
    services.administration.reports(),
  ]);
  return (
    <>
      <Intro
        title="A healthy platform starts here."
        description="Publishing operations, content quality, and community care."
      />
      <Stats
        values={[
          {
            label: "Published work",
            value: metrics.published,
            detail: "Comics and artwork",
          },
          {
            label: "Pending reviews",
            value: metrics.submitted,
            detail: "Awaiting editorial decisions",
          },
          {
            label: "Signed-in readers",
            value: metrics.readers,
            detail: "Accounts with reading progress",
          },
          {
            label: "Open reports",
            value: reports.length === 50 ? "50+" : reports.length,
            detail: "Reader-submitted concerns",
          },
        ]}
      />
      <section className="panel">
        <div className="section-head">
          <h2>Awaiting a decision</h2>
          <Link className="text-link" href="/admin/reviews">
            Review queue
          </Link>
        </div>
        {queue.length ? (
          <PublicationTable publications={queue.slice(0, 8)} admin />
        ) : (
          <p className="muted">
            You’re all caught up. New submissions will appear here.
          </p>
        )}
      </section>
      <div className="notice section">
        Review new submissions, respond to reader reports, and manage publishing
        access. Editorial decisions and account changes are recorded in the
        audit log.
      </div>
    </>
  );
}
