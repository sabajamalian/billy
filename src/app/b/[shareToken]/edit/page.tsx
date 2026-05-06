import { redirect } from "next/navigation";

import { HostEditView } from "@/components/bill-edit/HostEditView";
import { billToDto } from "@/lib/dto";
import { BillExpiredError, BillNotFoundError, getActiveBill, verifyHost } from "@/server/billing/bill-service";

type PageProps = { params: Promise<{ shareToken: string }> };

export default async function Page(props: PageProps) {
  const { shareToken } = await props.params;
  let bill;

  try {
    bill = await getActiveBill(shareToken);
  } catch (error) {
    if (error instanceof BillNotFoundError || error instanceof BillExpiredError) {
      redirect(`/b/${shareToken}`);
    }
    throw error;
  }

  const isHost = await verifyHost(bill);
  if (!isHost) redirect(`/b/${shareToken}`);

  return <HostEditView initialBill={billToDto(bill)} />;
}
