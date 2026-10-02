import { serviceId } from "@/server/service";
import { AuthForm } from "@/components/auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="login"
      workspace={serviceId()}
      next={params.next ?? (serviceId() === "reader" ? "/" : `/${serviceId()}`)}
    />
  );
}
