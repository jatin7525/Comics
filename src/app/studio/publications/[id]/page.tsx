import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { canManagePublication } from "@/domain/access";
import { Intro } from "@/components/ui";
import {
  PublicationEditor,
  UploadForm,
  type EditorData,
} from "@/components/publication-editor";
export default async function EditPublication({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(["author", "admin"]);
  const { id } = await params;
  const services = getServices();
  const publication = await services.publications.find(id);
  if (!publication || !canManagePublication(user, publication)) notFound();
  const {
    coverKey,
    createdAt: _created,
    updatedAt: _updated,
    publishedAt: _published,
    authorId: _author,
    authorName: _name,
    slug: _slug,
    ...fields
  } = publication;
  void _created;
  void _updated;
  void _published;
  void _author;
  void _name;
  void _slug;
  const data: EditorData = { ...fields, hasCover: !!coverKey };
  const pages = await services.publications.pages(id);
  return (
    <>
      <Intro
        title={publication.title}
        description="Changes save to MongoDB. Uploaded images are stored in private object storage."
      />
      <div className="editor-layout">
        <PublicationEditor publication={data} />
        <UploadForm publication={data} />
      </div>
      {pages.length > 0 && (
        <section className="panel">
          <h2>Reading order</h2>
          <p className="muted">
            Pages appear in upload order. The first four pages form the guest
            preview.
          </p>
          <div className="page-thumbnails">
            {pages.map((page) => (
              <figure key={page.id}>
                <a
                  href={`/api/studio/${id}/media/${page.number}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    loading="lazy"
                    src={`/api/studio/${id}/media/${page.number}`}
                    alt={page.alt}
                  />
                </a>
                <figcaption>Page {page.number}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
