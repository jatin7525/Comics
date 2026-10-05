import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { editorData } from "@/server/editor-data";
import { ChapterWorkspace } from "@/components/chapter-workspace";
export default async function EditChapter({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const user = await requireUser(["author", "admin"]);
  const { id, chapterId } = await params;
  const services = getServices();
  const publication = await services.publishing.owned(user, id);
  if (
    publication.kind !== "comic" ||
    !(
      publication.release?.id === chapterId ||
      publication.chapters?.some((c) => c.id === chapterId) ||
      (chapterId === "all" && !publication.chapters?.length)
    )
  )
    notFound();
  return (
    <ChapterWorkspace
      publication={editorData(
        publication,
        await services.publications.pages(id),
      )}
      chapterId={chapterId}
    />
  );
}
