import Link from "next/link";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { Intro } from "@/components/ui";
export default async function Applications() {
  await requireUser(["admin"]);
  const applications = await getServices().applications.queue();
  return (
    <>
      <Intro
        title="Meet your next creators."
        description="Review private samples and authorship evidence before granting publishing access. Showing the oldest 50 pending applications."
      />
      <section className="panel">
        {applications.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Sample</th>
                  <th>Submitted / updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td>{application.name}</td>
                    <td>
                      {application.sampleKind} · {application.samples.length}{" "}
                      images
                    </td>
                    <td>{application.updatedAt.toLocaleDateString("en-GB")}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/admin/applications/${application.id}`}
                      >
                        Review application
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No author applications are awaiting review.</p>
        )}
      </section>
    </>
  );
}
