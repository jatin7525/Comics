import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { ComicGrid, Intro } from "@/components/ui";
export default async function NewReleases() {
  const result = await getServices().publications.catalog({
    kind: "comic",
    limit: 12,
  });
  return (
    <>
      <Intro
        title="Fresh off the drawing board."
        description="The latest publications, ready for your next reading session."
      />
      <ComicGrid comics={result.items.map(comicCard)} />
    </>
  );
}
