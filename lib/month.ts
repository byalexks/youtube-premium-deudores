export function parseMesLabel(label: string) {
  const nombres = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const parts = label.split(" ");
  return { month: nombres.indexOf(parts[0] ?? ""), year: parseInt(parts[1] ?? "") };
}

export function mesLabelToIndex(label: string) {
  const { year, month } = parseMesLabel(label);
  return year * 12 + month;
}

