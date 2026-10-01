import Link from "next/link";
import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { ComicCard, Empty, Intro } from "./ui";

export async function LibraryView({ history = false }: { history?: boolean }) {
  const user = await requireUser();
  const items = await getServices().community.library(user.id, history);
  return (
    <>
      <Intro
        title={history ? "Back to your worlds." : "Your stories, together."}
        description={
          history
            ? "Your latest reading sessions, ready to continue."
            : "Comics and artwork you saved for later."
        }
      />
      {items.length ? (
        <div className="grid">
          {items.map((item) => (
            <div key={item.publication.id}>
              <ComicCard comic={comicCard(item.publication)} />
              {history && (
                <Link
                  className="text-link resume-link"
                  href={`/read/${item.publication.slug}/${item.page ?? 1}`}
                >
                  Continue from page {item.page ?? 1}
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title={
            history
              ? "Your first page is waiting."
              : "Make room for a new favorite."
          }
          href="/comics"
        >
          {history
            ? "Start reading a comic to save your progress."
            : "Open a story and select “Save to library”."}
        </Empty>
      )}
    </>
  );
}
