export interface VehiclePresentation {
  image: string;
  alt: string;
}

const vehiclePresentation: Record<string, VehiclePresentation> = {
  "pickup": { image: "pickup-3-ton.webp", alt: "White light-duty pickup truck with an open cargo bed" },
  "van": { image: "cargo-van-5-ton.webp", alt: "White high-roof enclosed cargo van" },
  "isuzu 5 ton": { image: "cab-over-box-truck-5-ton.webp", alt: "White medium-duty cab-over box truck" },
  "dry cargo": { image: "dry-cargo-truck-10-ton.webp", alt: "White rigid dry-cargo box truck" },
  "refrigerated": { image: "refrigerated-truck-15-ton.webp", alt: "White refrigerated box truck with a cooling unit" },
  "truck 22 ton": { image: "cargo-truck-22-ton.webp", alt: "White three-axle heavy cargo truck" },
  "truck 25 ton": { image: "cargo-truck-25-ton.webp", alt: "White heavy-duty cargo truck" },
  "truck 30 ton": { image: "cargo-truck-30-ton.webp", alt: "White four-axle heavy cargo truck" },
  "trailer": { image: "semi-trailer-45-ton.webp", alt: "White tractor unit with an enclosed semi-trailer" },
};

export function getVehiclePresentation(vehicleType: string): VehiclePresentation | null {
  const presentation = vehiclePresentation[vehicleType.trim().toLowerCase()];
  if (!presentation) return null;
  return {
    ...presentation,
    image: `${import.meta.env.BASE_URL}vehicles/${presentation.image}`,
  };
}
