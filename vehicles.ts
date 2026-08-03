export const VEHICLE_TYPES = [
  { value: "pickup", label: "Pickup", desc: "Up to 1 tonne — small parcels, local errands" },
  { value: "box_truck", label: "Box Truck", desc: "3–5 tonnes — palletized or boxed cargo" },
  { value: "flatbed_10t", label: "Flatbed 10T", desc: "10 tonnes — machinery, construction material" },
  { value: "trailer", label: "Trailer", desc: "20+ tonnes — bulk freight, long-haul corridor" },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]["value"];
