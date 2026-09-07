import { vehicleCapacityTons } from "../../../src/domain/cargo-load";
import { getVehiclePresentation } from "../../../src/domain/vehicle-presentation";

export type CustomerTruckOption = {
  key: string;
  label: string;
  capacityTons: number;
  image: string | null;
  imageAlt: string;
};

const VEHICLE_LABELS = [
  ["pickup", "Pickup"],
  ["van", "Van"],
  ["isuzu-5-ton", "Isuzu 5 Ton"],
  ["dry-cargo", "Dry Cargo"],
  ["refrigerated", "Refrigerated"],
  ["truck-22-ton", "Truck 22 Ton"],
  ["truck-25-ton", "Truck 25 Ton"],
  ["truck-30-ton", "Truck 30 Ton"],
  ["trailer", "Trailer"],
] as const;

export const CUSTOMER_TRUCKS: readonly CustomerTruckOption[] = VEHICLE_LABELS.map(([key, label]) => {
  const capacityTons = vehicleCapacityTons[label.toLowerCase()] ?? 0;
  const presentation = getVehiclePresentation(label);
  return {
    key,
    label,
    capacityTons,
    image: presentation?.image ?? null,
    imageAlt: presentation?.alt ?? `${label} cargo vehicle`,
  };
});

export function customerTruckByKey(key: string) {
  return CUSTOMER_TRUCKS.find((truck) => truck.key === key) ?? CUSTOMER_TRUCKS[0];
}
