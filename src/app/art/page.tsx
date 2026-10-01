import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { ComicGrid, Empty, Intro } from "@/components/ui";
export default async function Art() {
  const result = await getServices().publications.catalog({
    kind: "artwork",
    limit: 24,
  });
  return (
    <>
      <Intro
        title="Beyond the panels."
        description="Sketchbooks, world-building, and original art from our creators."
      />
      {result.items.length ? (
        <ComicGrid comics={result.items.map(comicCard)} />
      ) : (
        <Empty title="The gallery is taking shape.">
          Approved creator artwork will appear here.
        </Empty>
      )}
    </>
  );
}
