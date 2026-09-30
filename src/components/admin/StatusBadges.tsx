import { Badge } from "@/components/ui/Badge";
import { ORDER_STATUS_TONE, orderStatusLabel } from "@/lib/labels";
import type { FulfillmentType, OrderStatus } from "@/types/domain";

export function OrderStatusBadge({ status, type }: { status: OrderStatus; type?: FulfillmentType }) {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{orderStatusLabel(status, type)}</Badge>;
}

export function PaidBadge({ paid }: { paid: boolean }) {
  return <Badge tone={paid ? "success" : "warning"}>{paid ? "Pago" : "A receber"}</Badge>;
}
