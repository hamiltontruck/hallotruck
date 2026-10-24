import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships, type PartnerMembership } from "../../services/partner.service";

export function usePartnerScope() {
  const [params, setParams] = useSearchParams();
  const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getCurrentPartnerMemberships().then(rows => { if (active) setMemberships(rows); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Organization access could not be verified."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const membership = memberships.find(row => row.partner_id === params.get("organization")) ?? memberships[0] ?? null;
  const partnerId = membership?.partner_id ?? "";
  const canManageDrivers = ["owner", "admin"].includes(membership?.member_role ?? "");
  useEffect(() => {
    if (loading || !partnerId || params.get("organization") === partnerId) return;
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (next.get("organization")) next.delete("trip");
      next.set("organization", partnerId);
      return next;
    }, { replace: true });
  }, [loading, partnerId, params, setParams]);
  function selectOrganization(id: string) {
    if (!memberships.some(row => row.partner_id === id)) return;
    const next = new URLSearchParams(params); next.set("organization", id); next.delete("trip"); setParams(next);
  }
  return { membership, memberships, partnerId, canManageDrivers, loading, error, selectOrganization };
}

export function usePartnerResource<T>(partnerId: string, read: (id: string) => Promise<T>, pollMs = 0) {
  const sequence = useRef(0);
  const currentScope = useRef({ partnerId, read });
  currentScope.current = { partnerId, read };
  const pending = useRef<{ id: string; sequence: number } | null>(null);
  const [state, setState] = useState<{ id: string; data: T | null; error: string; loading: boolean; updatedAt: number | null }>({ id: "", data: null, error: "", loading: false, updatedAt: null });
  const refresh = useCallback(async () => {
    if (!partnerId || currentScope.current.partnerId !== partnerId || currentScope.current.read !== read || pending.current?.id === partnerId) return;
    const current = ++sequence.current;
    pending.current = { id: partnerId, sequence: current };
    setState(previous => previous.id === partnerId ? { ...previous, loading: true, error: "" } : { id: partnerId, data: null, error: "", loading: true, updatedAt: null });
    try {
      const data = await read(partnerId);
      if (sequence.current === current) setState({ id: partnerId, data, error: "", loading: false, updatedAt: Date.now() });
    } catch (reason) {
      if (sequence.current === current) setState({ id: partnerId, data: null, error: reason instanceof Error ? reason.message : "Could not refresh this organization.", loading: false, updatedAt: null });
    } finally { if (pending.current?.sequence === current) pending.current = null; }
  }, [partnerId, read]);
  useEffect(() => { void refresh(); return () => { sequence.current++; pending.current = null; }; }, [refresh]);
  useEffect(() => {
    if (!pollMs || !partnerId) return;
    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [partnerId, pollMs, refresh]);
  const current = state.id === partnerId;
  return { data: current ? state.data : null, error: current ? state.error : "", loading: Boolean(partnerId) && (!current || state.loading), updatedAt: current ? state.updatedAt : null, refresh };
}
