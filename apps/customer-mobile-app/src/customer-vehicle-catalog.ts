import { vehicleCapacityTons } from "../../../src/domain/cargo-load";
import { getVehiclePresentation } from "../../../src/domain/vehicle-presentation";
import type { CustomerLanguage } from "./customer-language";

export type CustomerTruckOption = {
  key: CustomerTruckKey;
  label: string;
  capacityTons: number;
  image: string;
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

export type CustomerTruckKey = (typeof VEHICLE_LABELS)[number][0];

const CUSTOMER_TRUCK_LABELS: Record<CustomerLanguage, Record<CustomerTruckKey, string>> = {
  en: {
    pickup: "Pickup",
    van: "Van",
    "isuzu-5-ton": "Isuzu 5 Ton",
    "dry-cargo": "Dry Cargo",
    refrigerated: "Refrigerated",
    "truck-22-ton": "Truck 22 Ton",
    "truck-25-ton": "Truck 25 Ton",
    "truck-30-ton": "Truck 30 Ton",
    trailer: "Trailer",
  },
  om: {
    pickup: "Piikaappii",
    van: "Vaanii",
    "isuzu-5-ton": "Isuzu Toonii 5",
    "dry-cargo": "Konkolaataa Feʼumsaa",
    refrigerated: "Konkolaataa Qabbanaaʼaa",
    "truck-22-ton": "Konkolaataa Toonii 22",
    "truck-25-ton": "Konkolaataa Toonii 25",
    "truck-30-ton": "Konkolaataa Toonii 30",
    trailer: "Tireelara",
  },
  am: {
    pickup: "ፒክአፕ",
    van: "ቫን",
    "isuzu-5-ton": "ኢሱዙ 5 ቶን",
    "dry-cargo": "ደረቅ ጭነት",
    refrigerated: "ማቀዝቀዣ መኪና",
    "truck-22-ton": "22 ቶን መኪና",
    "truck-25-ton": "25 ቶን መኪና",
    "truck-30-ton": "30 ቶን መኪና",
    trailer: "ተሳቢ",
  },
};

const CUSTOMER_VEHICLE_IMAGES: Record<CustomerTruckKey, string> = {
  pickup: new URL("../../../public/vehicles/pickup-3-ton.webp", import.meta.url).href,
  van: new URL("../../../public/vehicles/cargo-van-5-ton.webp", import.meta.url).href,
  "isuzu-5-ton": new URL("../../../public/vehicles/cab-over-box-truck-5-ton.webp", import.meta.url).href,
  "dry-cargo": new URL("../../../public/vehicles/dry-cargo-truck-10-ton.webp", import.meta.url).href,
  refrigerated: new URL("../../../public/vehicles/refrigerated-truck-15-ton.webp", import.meta.url).href,
  "truck-22-ton": new URL("../../../public/vehicles/cargo-truck-22-ton.webp", import.meta.url).href,
  "truck-25-ton": new URL("../../../public/vehicles/cargo-truck-25-ton.webp", import.meta.url).href,
  "truck-30-ton": new URL("../../../public/vehicles/cargo-truck-30-ton.webp", import.meta.url).href,
  trailer: new URL("../../../public/vehicles/semi-trailer-45-ton.webp", import.meta.url).href,
};

export const CUSTOMER_TRUCKS: readonly CustomerTruckOption[] = VEHICLE_LABELS.map(([key, label]) => {
  const capacityTons = vehicleCapacityTons[label.toLowerCase()] ?? 0;
  const presentation = getVehiclePresentation(label);
  return {
    key,
    label,
    capacityTons,
    image: CUSTOMER_VEHICLE_IMAGES[key],
    imageAlt: presentation?.alt ?? `${label} cargo vehicle`,
  };
});

export function customerTruckByKey(key: string) {
  return CUSTOMER_TRUCKS.find((truck) => truck.key === key) ?? CUSTOMER_TRUCKS[0];
}

export function customerTruckDisplayLabel(truck: CustomerTruckOption, language: CustomerLanguage) {
  return CUSTOMER_TRUCK_LABELS[language][truck.key];
}
