import { requireUser } from "@/server/session";
import { Intro } from "@/components/ui";
import { PublicationEditor } from "@/components/publication-editor";
export default async function NewPublication() {
  await requireUser(["author", "admin"]);
  return (
    <>
      <Intro
        title="Give your next story a home."
        description="Start with a draft. Add your cover and pages after saving."
      />
      <PublicationEditor />
    </>
  );
}
