import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { editorData } from "@/server/editor-data";
import { PublicationWorkspace } from "@/components/publication-workspace";
export default async function EditExistingPublication({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(["author", "admin"]);
  const { id } = await params;
  const services = getServices();
  const publication = await services.publishing.owned(user, id);
  const pages = await services.publications.pages(id);
  return <PublicationWorkspace publication={editorData(publication, pages)} />;
}
