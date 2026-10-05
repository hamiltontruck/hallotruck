import { z } from 'zod';
import { driverSupabaseServer } from '../../helpers/driverSupabaseServer';

const inputSchema = z.object({
  orderId: z.string().uuid(),
  truckId: z.string().uuid(),
});

export async function handle(request: Request) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'A valid order and truck are required.' }, { status: 400 });
  return driverSupabaseServer.rpcForApprovedDriver(request, 'claim_order_with_truck_v2', {
    p_order_id: input.data.orderId,
    p_truck_id: input.data.truckId,
  });
}
