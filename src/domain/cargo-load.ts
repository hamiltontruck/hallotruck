export type CargoUnit = "ton" | "quintal";

export const vehicleCapacityTons: Record<string, number> = {
  pickup: 3,
  van: 5,
  "isuzu 5 ton": 5,
  "dry cargo": 10,
  refrigerated: 15,
  "truck 22 ton": 22,
  "truck 25 ton": 25,
  "truck 30 ton": 30,
  trailer: 45,
};

export function cargoToTons(quantity: number, unit: CargoUnit) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return unit === "quintal" ? quantity / 10 : quantity;
}

export function formatCargoLoad(quantity: number, unit: CargoUnit) {
  const value = Number.isInteger(quantity)
    ? quantity.toLocaleString()
    : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${value} ${unit === "quintal" ? "quintal" : "ton"}`;
}

export function validateCargoLoad(
  vehicleType: string,
  cargoQuantity: number,
  cargoUnit: CargoUnit,
) {
  const cargoTons = cargoToTons(cargoQuantity, cargoUnit);
  if (cargoTons <= 0) throw new Error("Enter a cargo amount greater than zero.");

  const capacity = vehicleCapacityTons[vehicleType.toLowerCase()];
  if (capacity && cargoTons > capacity) {
    throw new Error(`${vehicleType} supports up to ${capacity} tons. Choose a larger vehicle or reduce the load.`);
  }

  return cargoTons;
}
