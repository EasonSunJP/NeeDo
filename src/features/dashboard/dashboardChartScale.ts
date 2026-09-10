export interface DashboardAxis {
  minimum: number;
  maximum: number;
  ticks: number[];
  y(value: number, top: number, height: number): number;
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function normalizeTick(value: number): number {
  return Number(value.toPrecision(12));
}

export function createDashboardAxis(values: number[], tickCount = 5): DashboardAxis {
  const finite = values.filter(Number.isFinite);
  const dataMinimum = Math.min(0, ...(finite.length ? finite : [0]));
  const dataMaximum = Math.max(0, ...(finite.length ? finite : [0]));
  if (dataMinimum === 0 && dataMaximum === 0) {
    return {
      minimum: 0,
      maximum: 1,
      ticks: [0],
      y: (value, top, height) => top + height - Math.min(1, Math.max(0, value)) * height
    };
  }

  const divisions = Math.max(1, Math.floor(tickCount) - 1);
  const step = niceStep((dataMaximum - dataMinimum) / divisions);
  const minimum = Math.floor(dataMinimum / step) * step;
  const maximum = Math.ceil(dataMaximum / step) * step;
  const ticks: number[] = [];
  for (let value = minimum; value <= maximum + step / 2; value += step) {
    ticks.push(normalizeTick(value));
  }
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((left, right) => left - right);

  return {
    minimum,
    maximum,
    ticks: [...new Set(ticks)],
    y(value, top, height) {
      const ratio = (value - minimum) / (maximum - minimum);
      return top + height - Math.min(1, Math.max(0, ratio)) * height;
    }
  };
}
