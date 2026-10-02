import Link from "next/link";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { serviceOrigins } from "@/server/service";
import { Intro } from "@/components/ui";
import { siteName } from "@/server/brand";
import {
  ApplicationEditor,
  StartApplication,
} from "@/components/author-application";
export default async function BecomeAuthor() {
  const user = await requireUser();
  const [application, name] = await Promise.all([
    getServices().applications.mine(user.id),
    siteName(),
  ]);
  return (
    <>
      <Intro
        title={`Bring your stories to ${name}.`}
        description="Apply for Author Studio with a short comic or original artwork. Our editorial team reviews every application."
      />
      {user.role !== "reader" ? (
        <section className="panel">
          <h2>You have publishing access.</h2>
          <p>
            You can continue reading with this account and sign in separately to
            Author Studio.
          </p>
          <a className="primary" href={`${serviceOrigins().studio}/studio`}>
            Open Author Studio
          </a>
        </section>
      ) : application ? (
        <ApplicationEditor
          key={application.version}
          application={{
            id: application.id,
            userId: application.userId,
            name: application.name,
            status: application.status,
            version: application.version,
            introduction: application.introduction,
            portfolioUrl: application.portfolioUrl,
            sampleKind: application.sampleKind,
            processNotes: application.processNotes,
            rightsConfirmed: application.rightsConfirmed,
            feedback: application.feedback,
            thumbnail: application.thumbnail
              ? { id: application.thumbnail.id, alt: application.thumbnail.alt }
              : null,
            samples: application.samples.map(({ id, alt }) => ({ id, alt })),
          }}
        />
      ) : (
        <section className="panel">
          <h2>Show us what you create.</h2>
          <p>
            Submit original artwork, or a short comic of at least two pages.
            Tell us about your process and share an optional portfolio link.
            Sketches and work-in-progress can help demonstrate authorship.
          </p>
          <p>
            Samples stay private. Applying does not unlock Studio until an
            administrator approves your work.
          </p>
          <StartApplication />
          <p>
            <Link className="text-link" href="/guidelines">
              Read our publishing guidelines
            </Link>
          </p>
        </section>
      )}
    </>
  );
}
