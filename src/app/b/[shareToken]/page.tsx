import { redirect } from "next/navigation";
import {
  BillExpiredError,
  BillNotFoundError,
  getActiveBill,
  verifyHost,
} from "@/server/billing/bill-service";
import { billToDto } from "@/lib/dto";
import { SelectionView } from "@/components/bill/SelectionView";
import { ScanningPlaceholder } from "@/components/bill/ScanningPlaceholder";
import { BillNotFound } from "@/components/bill/BillNotFound";
import { BillExpired } from "@/components/bill/BillExpired";

type PageProps = { params: Promise<{ shareToken: string }> };

export default async function BillPage(props: PageProps) {
  const { shareToken } = await props.params;

  let bill;
  try {
    bill = await getActiveBill(shareToken);
  } catch (err) {
    if (err instanceof BillNotFoundError) return <BillNotFound />;
    if (err instanceof BillExpiredError) return <BillExpired />;
    throw err;
  }

  const isHost = await verifyHost(bill);

  // Host on a SCANNING bill → send them to the edit page.
  if (bill.status === "SCANNING" && isHost) {
    redirect(`/b/${shareToken}/edit`);
  }

  // Guest on a SCANNING bill → show "host preparing" placeholder.
  if (bill.status === "SCANNING" && !isHost) {
    return <ScanningPlaceholder shareToken={shareToken} />;
  }

  // READY → everyone gets the selection UI.
  return <SelectionView initialBill={billToDto(bill)} isHost={isHost} />;
}
