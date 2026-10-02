import Link from "next/link";
import { BillingNotice, Intro } from "@/components/ui";
import { siteName } from "@/server/brand";
export default async function Membership() {
  const name = await siteName();
  return (
    <>
      <Intro
        title="More story. More possibility."
        description="Choose how you’ll support the stories and creators you love."
      />
      <BillingNotice />
      <div className="plan-grid">
        <article className="plan">
          <h2>The curious reader</h2>
          <p>A place to begin. Available now.</p>
          <div className="price">Free</div>
          <ul>
            <li>Browse the entire catalog</li>
            <li>Four-page guest previews</li>
            <li>Free comics after sign-in</li>
            <li>Save stories and follow creators</li>
            <li>Synced reading progress</li>
          </ul>
          <Link className="secondary full-width" href="/comics?access=free">
            Explore free comics
          </Link>
        </article>
        <article className="plan featured">
          <span className="tag">Coming later</span>
          <h2>{name} Plus</h2>
          <p>For the endlessly curious.</p>
          <div className="price">Membership</div>
          <ul>
            <li>Membership-included stories</li>
            <li>A clear, recurring price</li>
            <li>Support participating creators</li>
            <li>Account-based access</li>
            <li>Purchase-only titles excluded</li>
          </ul>
          <button className="primary full-width" disabled>
            Subscriptions not yet available
          </button>
        </article>
        <article className="plan">
          <span className="tag">Coming later</span>
          <h2>Make it yours</h2>
          <p>One story. No subscription.</p>
          <div className="price">Per comic</div>
          <ul>
            <li>Buy only eligible titles</li>
            <li>Access without a membership</li>
            <li>Clear purchase scope</li>
            <li>Read again from your account</li>
            <li>Secure checkout when launched</li>
          </ul>
          <button className="secondary full-width" disabled>
            Purchases not yet available
          </button>
        </article>
      </div>
    </>
  );
}
