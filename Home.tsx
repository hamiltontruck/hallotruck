import { useNavigate } from "react-router-dom";
import { CargoPlate } from "../components/ui/CargoPlate";
import { Button } from "../components/ui/Button";

export function Home() {
  const navigate = useNavigate();

  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <CargoPlate size="sm">HT-{new Date().getFullYear()}—LIVE</CargoPlate>
          <span className="text-steel text-sm font-body">
            Adama · Djibouti · Mogadishu corridor
          </span>
        </div>

        <h1 className="font-display font-bold text-5xl sm:text-7xl leading-[0.95] text-asphalt max-w-3xl">
          Smarter logistics.
          <br />
          <span className="text-route">Simple</span> &amp;{" "}
          <span className="text-amber">best.</span>
        </h1>

        <p className="font-body text-steel text-lg max-w-xl mt-6 leading-relaxed">
          Get an instant price, book a verified truck, and watch your cargo
          move — live — from pickup to delivery. No cash risk, no guessing
          where your shipment is.
        </p>

        <div className="flex flex-wrap gap-4 mt-10">
          <Button onClick={() => navigate("/quote")}>Get an instant quote →</Button>
          <Button variant="ghost" onClick={() => navigate("/tracking")}>
            Track a shipment
          </Button>
        </div>

        {/* Signature: animated route line connecting pickup to delivery */}
        <div className="mt-20 relative h-24 flex items-center">
          <div className="w-3 h-3 rounded-full bg-asphalt shrink-0" />
          <div className="flex-1 h-0.5 route-line mx-2 relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-route animate-[drive_3.5s_ease-in-out_infinite]" />
          </div>
          <div className="w-3 h-3 rounded-full bg-route shrink-0" />
          <style>{`
            @keyframes drive {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(300%); }
            }
          `}</style>
        </div>
        <div className="flex justify-between font-mono text-xs text-steel mt-1">
          <span>PICKUP</span>
          <span>DELIVERED</span>
        </div>
      </section>

      {/* How it works — ordered because it's a real sequence */}
      <section className="border-t border-line bg-asphalt text-bone">
        <div className="max-w-6xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-10">
          {[
            {
              n: "01",
              title: "Quote",
              body: "Drop your pickup and destination — get an instant, distance-based price on a truck-safe route.",
            },
            {
              n: "02",
              title: "Book & pay",
              body: "Confirm the load. Pay by Telebirr or M-PESA — funds are held in escrow until delivery.",
            },
            {
              n: "03",
              title: "Track",
              body: "Follow your truck live on the map with a unique tracking ID, start to finish.",
            },
          ].map((step) => (
            <div key={step.n}>
              <div className="font-mono text-amber text-sm mb-2">{step.n}</div>
              <div className="font-display font-semibold text-xl mb-2">{step.title}</div>
              <p className="font-body text-sm text-bone/70 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
