import { AuthForm } from "@/components/auth-form";
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm mode="register" next={params.next} />;
}
