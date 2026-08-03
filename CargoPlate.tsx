interface CargoPlateProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function CargoPlate({ children, size = "md" }: CargoPlateProps) {
  const sizeClass =
    size === "sm" ? "text-xs px-2 py-1" : size === "lg" ? "text-lg px-4 py-2" : "text-sm px-3 py-1.5";
  return <span className={`cargo-plate ${sizeClass}`}>{children}</span>;
}
