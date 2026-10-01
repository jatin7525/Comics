import { requireUser } from "@/server/session";
import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { ComicGrid, Empty, Intro } from "@/components/ui";
export default async function Following() {
  const user = await requireUser();
  const items = await getServices().community.feed(user.id);
  return (
    <>
      <Intro
        title="From the creators you follow."
        description="Their latest stories and artwork, all in one place."
      />
      {items.length ? (
        <ComicGrid comics={items.map(comicCard)} />
      ) : (
        <Empty title="Find your people." href="/comics">
          Follow a creator from a story page to see their latest publications
          here.
        </Empty>
      )}
    </>
  );
}
