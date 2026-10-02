import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { BillingNotice, Intro, Status } from "@/components/ui";
import { PublicationTable } from "@/components/publication-table";
import {
  HideForm,
  PolicyForm,
  ResolveReportForm,
  UserAccessForm,
} from "@/components/admin-actions";

const titles: Record<string, [string, string]> = {
  reviews: [
    "Review queue.",
    "Review all assets, publishing rights, and age ratings before approving a publication.",
  ],
  content: [
    "Content library.",
    "The latest 50 publications across the platform.",
  ],
  users: [
    "Authors & access.",
    "The latest 50 accounts. Grant publishing access only to approved creators.",
  ],
  reports: [
    "Reader reports.",
    "Investigate concerns and record a resolution. Up to 50 open reports.",
  ],
  memberships: [
    "Membership operations.",
    "Entitlements are separated from the future payment integration.",
  ],
  ads: [
    "Advertising & partnerships.",
    "Start with transparent, contextual placements.",
  ],
  policies: [
    "Publishing guardrails.",
    "Clear controls with accountable changes.",
  ],
  audit: [
    "Audit trail.",
    "The latest 100 administrative decisions, recorded with their database changes.",
  ],
};
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await requireUser(["admin"]);
  const { section } = await params;
  const title = titles[section];
  if (!title) notFound();
  const services = getServices(),
    admin = services.administration;
  let content: React.ReactNode;
  if (section === "reviews") {
    const queue = await admin.reviewQueue();
    content = (
      <section className="panel">
        {queue.length ? (
          <PublicationTable publications={queue} admin />
        ) : (
          <p className="muted">No submissions are awaiting review.</p>
        )}
      </section>
    );
  } else if (section === "content") {
    const publications = await admin.content();
    content = (
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Publication</th>
                <th>Author</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {publications.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/admin/reviews/${item.id}`}>
                      <strong>{item.title}</strong>
                    </Link>
                  </td>
                  <td>{item.authorName}</td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td>
                    {item.status === "published" ? (
                      <HideForm id={item.id} version={item.version} />
                    ) : (
                      <Link
                        className="text-link"
                        href={`/admin/reviews/${item.id}`}
                      >
                        View submission
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  } else if (section === "users") {
    const users = await admin.users();
    content = (
      <section className="panel">
        <p className="muted">
          Creators register normally first. Grant the author role here after
          your onboarding review. Access changes invalidate existing sessions.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <small className="table-subtitle">{user.email}</small>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <span
                      className={`status ${user.status === "active" ? "green" : "red"}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <UserAccessForm
                      id={user.id}
                      role={user.role}
                      status={user.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  } else if (section === "policies" || section === "ads") {
    const policy = await admin.policy();
    content = (
      <>
        <PolicyForm
          adsEnabled={policy.adsEnabled}
          submissionsEnabled={policy.submissionsEnabled}
        />
        {section === "ads" && (
          <div className="notice section">
            No ad revenue or impressions are fabricated. Campaign targeting,
            impression measurement, and sponsorship billing are outside this
            implementation.
          </div>
        )}
      </>
    );
  } else if (section === "audit") {
    const events = await admin.audit();
    content = (
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.createdAt.toLocaleString("en-GB")}</td>
                  <td>{event.actorName}</td>
                  <td>{event.action}</td>
                  <td className="audit-details">
                    {event.details || "No note"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!events.length && (
          <p className="muted">Administrative actions will appear here.</p>
        )}
      </section>
    );
  } else if (section === "reports") {
    const reports = await admin.reports();
    content = (
      <>
        {reports.map((report) => (
          <section className="panel" key={report.id}>
            <h2>{report.title}</h2>
            <p>{report.reason}</p>
            <p className="muted">
              Reported {report.createdAt.toLocaleDateString("en-GB")}
            </p>
            <ResolveReportForm id={report.id} />
          </section>
        ))}
        {!reports.length && (
          <div className="empty">
            <h2>No open reports.</h2>
            <p>Reader concerns will appear here for investigation.</p>
          </div>
        )}
      </>
    );
  } else
    content = (
      <>
        <BillingNotice />
        <div className="panel">
          <h2>Access rules are ready for billing</h2>
          <p className="muted">
            The server distinguishes free, membership-only, purchase-only, and
            dual-access comics. No public endpoint can mint entitlements. A
            future payment integration must create grants only after verified,
            idempotent payment events.
          </p>
        </div>
      </>
    );
  return (
    <>
      <Intro title={title[0]} description={title[1]} />
      {content}
    </>
  );
}
