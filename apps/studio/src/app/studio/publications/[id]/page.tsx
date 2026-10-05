import Link from "next/link";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { editorData } from "@/server/editor-data";
import { Intro } from "@/components/ui";
import { PublicationEditor } from "@/components/publication-editor";
export default async function EditPublication({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(["author", "admin"]);
  const { id } = await params;
  const services = getServices();
  const publication = await services.publishing.owned(user, id);
  const pages = await services.publications.pages(id);
  return (
    <>
      <Intro
        title={publication.title}
        description="Prepare your work, preview the reading experience, and send it for editorial review."
      />
      <p>
        <Link
          className="text-link"
          href={`/studio/publications/${publication.id}/edit`}
        >
          Open comic & chapter editor
        </Link>
      </p>
      <PublicationEditor publication={editorData(publication, pages)} />
    </>
  );
}
