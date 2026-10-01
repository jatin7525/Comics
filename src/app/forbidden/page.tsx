import { Empty } from "@/components/ui";
export default function Forbidden() {
  return (
    <Empty title="This workspace needs a different role." href="/">
      Author Studio is reserved for authorized creators. The admin console is
      available to administrators.
    </Empty>
  );
}
