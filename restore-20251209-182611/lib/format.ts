export function formatShortDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEnergy(value: number) {
  return `${value.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`;
}
