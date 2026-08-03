import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, readOnly }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange(n)}
          className={`text-2xl leading-none ${
            n <= display ? "text-amber" : "text-line"
          } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
