import { Intro } from "@/components/ui";
export default function About() {
  return (
    <>
      <Intro
        title="Stories live here."
        description="Astra Comics is a home for independent visual storytelling."
      />
      <article className="panel prose">
        <h2>Every panel opens a world.</h2>
        <p>
          We bring readers, comic creators, and artists together. Browse every
          published story, read its first four pages freely, and follow the
          people whose worlds you want to return to.
        </p>
        <h2>Built around creators</h2>
        <p>
          Authorized authors publish through an editorial review process.
          Artwork, publishing rights, age ratings, and reader concerns are part
          of that process.
        </p>
      </article>
    </>
  );
}
