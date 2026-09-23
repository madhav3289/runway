export function Disclaimer({ className = "" }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Forecasts are statistical estimates based on your past spending, not financial advice.
    </p>
  );
}
