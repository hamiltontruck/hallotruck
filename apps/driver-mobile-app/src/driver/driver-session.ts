import type { Session, SupabaseClient, User } from "@supabase/supabase-js";

type DriverSession = { client: SupabaseClient; user: User; session: Session };

const pendingByClient = new WeakMap<object, Map<string, Promise<DriverSession>>>();

export function requireExpectedDriverSession(
  client: SupabaseClient,
  expectedUserId: string,
  context = "Driver",
): Promise<DriverSession> {
  let pendingByUser = pendingByClient.get(client);
  if (!pendingByUser) {
    pendingByUser = new Map();
    pendingByClient.set(client, pendingByUser);
  }
  const existing = pendingByUser.get(expectedUserId);
  if (existing) return existing;

  const pending = (async () => {
    const [userResult, sessionResult] = await Promise.all([
      client.auth.getUser(),
      client.auth.getSession(),
    ]);
    const user = userResult.data.user;
    const session = sessionResult.data.session;
    if (userResult.error || sessionResult.error || !user || !session) {
      throw new Error("Driver session xumurameera. Deebi'ii seeni.");
    }
    if (user.id !== expectedUserId || session.user.id !== expectedUserId) {
      throw new Error(`Mobile session jijjiirameera. ${context} irra deebi'ii bani.`);
    }
    return { client, user, session };
  })();
  pendingByUser.set(expectedUserId, pending);
  void pending.finally(() => {
    if (pendingByUser?.get(expectedUserId) === pending) pendingByUser.delete(expectedUserId);
  }).catch(() => undefined);
  return pending;
}
