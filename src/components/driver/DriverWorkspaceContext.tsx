import { createContext, useContext } from "react";
import type { DriverWorkspace } from "../../services/partner-driver.service";

export const DriverWorkspaceContext = createContext<DriverWorkspace | null>(null);
export function useDriverWorkspace() { return useContext(DriverWorkspaceContext); }
export function driverWorkspacePath(workspace: DriverWorkspace | null, page: "home" | "documents" | "trip") {
  const base = workspace?.kind === "partner" ? "/partner/driver" : "/driver";
  return page === "home" ? base : `${base}/${page === "documents" && workspace?.kind !== "partner" ? "profile" : page}`;
}
