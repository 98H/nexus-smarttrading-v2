import React, { useEffect, useRef, useState } from "react";
import styles from "./WatchlistRow.module.css";

export interface WatchlistRowProps {
  symbol: string;
  price: number;
}

export const WatchlistRow: React.FC<WatchlistRowProps> = ({ symbol, price }) => {
  const [flashClass, setFlashClass] = useState<string | null>(null);
  const [percentageChange, setPercentageChange] = useState<number>(0);
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevPriceRef.current !== null) {
      const prev = prevPriceRef.current;
      if (price > prev) {
        setFlashClass("uptick");
        setPercentageChange(prev > 0 ? ((price - prev) / prev) * 100 : 0);
      } else if (price < prev) {
        setFlashClass("downtick");
        setPercentageChange(prev > 0 ? ((price - prev) / prev) * 100 : 0);
      }
    }
    prevPriceRef.current = price;

    const timer = setTimeout(() => {
      setFlashClass(null);
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [price]);

  const flashStyle =
    flashClass === "uptick"
      ? styles.uptick
      : flashClass === "downtick"
      ? styles.downtick
      : "";

  return (
    <div
      className={`${styles.row || ""} ${flashStyle}`.trim()}
      data-testid={`watchlist-row-${symbol}`}
    >
      <span className="symbol">{symbol}</span>
      <span className="price">{price.toFixed(2)}</span>
      <span className="change">
        {percentageChange >= 0
          ? `+${percentageChange.toFixed(2)}%`
          : `${percentageChange.toFixed(2)}%`}
      </span>
    </div>
  );
};

export default WatchlistRow;