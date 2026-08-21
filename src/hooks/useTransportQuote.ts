import { useEffect, useState } from "react";
import { calculateTransportQuote, type QuoteBreakdown } from "../services/quote-pricing.service";

export function useTransportQuote(input: {
  distanceKm: number;
  vehicleType: string;
  cargoTons: number;
  enabled: boolean;
}) {
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setQuote(null);
    setError("");
    if (
      !input.enabled ||
      !input.vehicleType ||
      !Number.isFinite(input.distanceKm) ||
      input.distanceKm <= 0 ||
      !Number.isFinite(input.cargoTons) ||
      input.cargoTons <= 0
    ) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void calculateTransportQuote(input.distanceKm, input.vehicleType, input.cargoTons)
        .then((result) => {
          if (active) setQuote(result);
        })
        .catch((quoteError) => {
          if (active) setError(quoteError instanceof Error ? quoteError.message : "Could not calculate the latest quote.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [input.cargoTons, input.distanceKm, input.enabled, input.vehicleType]);

  return { quote, loading, error };
}
