export interface GridCalculationParams {
  viewport: {
    width: number;
    height: number;
  };
  priceRange: {
    min: number;
    max: number;
  };
  timeRange: {
    min: number;
    max: number;
  };
  minPixelSpacing?: {
    x: number;
    y: number;
  };
}

export interface StepResult {
  step: number;
  subStep: number;
  subdivisionAlpha: number;
}

export interface GridStepsResult {
  priceStep: number;
  timeStep: number;
  priceSubStep: number;
  timeSubStep: number;
  subPriceAlpha: number;
  subTimeAlpha: number;
  priceLines: number[];
  timeLines: number[];
}

const TIME_STEPS: readonly number[] = [
  1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 900, 1800,
  3600, 7200, 10800, 14400, 21600, 43200,
  86400, 172800, 259200, 604800, 1209600,
  2592000, 5184000, 7776000, 15552000,
  31536000, 63072000, 157680000, 315360000
];

function cleanPrecision(val: number): number {
  if (Math.abs(val) < 1e-12) return 0;
  return Number(val.toPrecision(12));
}

function calculateDecimalNiceStep(
  span: number,
  pixelExtent: number,
  minPixelSpacing: number
): StepResult {
  const rawStep = (span / pixelExtent) * minPixelSpacing;
  const exponent = Math.floor(Math.log10(rawStep));
  const mag = Math.pow(10, exponent);
  const fraction = rawStep / mag;

  let step: number;
  let subStep: number;

  if (fraction <= 1.0 + 1e-9) {
    step = 1.0 * mag;
    subStep = 0.5 * mag;
  } else if (fraction <= 2.0 + 1e-9) {
    step = 2.0 * mag;
    subStep = 1.0 * mag;
  } else if (fraction <= 5.0 + 1e-9) {
    step = 5.0 * mag;
    subStep = 2.0 * mag;
  } else {
    step = 10.0 * mag;
    subStep = 5.0 * mag;
  }

  const subPixels = (subStep / span) * pixelExtent;
  const minSubPixels = minPixelSpacing * (subStep / step);
  const maxSubPixels = minPixelSpacing;
  const alphaRange = maxSubPixels - minSubPixels;
  const subdivisionAlpha =
    alphaRange > 0 ? Math.max(0, Math.min(1, (subPixels - minSubPixels) / alphaRange)) : 0.0;

  return { step, subStep, subdivisionAlpha };
}

function calculateTimeNiceStep(
  span: number,
  pixelExtent: number,
  minPixelSpacing: number
): StepResult {
  const rawStep = (span / pixelExtent) * minPixelSpacing;

  if (rawStep < 1) {
    return calculateDecimalNiceStep(span, pixelExtent, minPixelSpacing);
  }

  const maxPredefined = TIME_STEPS[TIME_STEPS.length - 1];
  if (rawStep > maxPredefined) {
    const year = 31536000;
    const dec = calculateDecimalNiceStep(span / year, pixelExtent, minPixelSpacing);
    return {
      step: dec.step * year,
      subStep: dec.subStep * year,
      subdivisionAlpha: dec.subdivisionAlpha
    };
  }

  let step = maxPredefined;
  let subStep = TIME_STEPS[TIME_STEPS.length - 2];

  for (let i = 0; i < TIME_STEPS.length; i++) {
    if (TIME_STEPS[i] >= rawStep - 1e-9) {
      step = TIME_STEPS[i];
      subStep = i > 0 ? TIME_STEPS[i - 1] : step / 2;
      break;
    }
  }

  const subPixels = (subStep / span) * pixelExtent;
  const minSubPixels = minPixelSpacing * (subStep / step);
  const maxSubPixels = minPixelSpacing;
  const alphaRange = maxSubPixels - minSubPixels;
  const subdivisionAlpha =
    alphaRange > 0 ? Math.max(0, Math.min(1, (subPixels - minSubPixels) / alphaRange)) : 0.0;

  return { step, subStep, subdivisionAlpha };
}

export function calculateNiceStep(
  span: number,
  pixelExtent: number,
  minPixelSpacing: number,
  isTime = false
): StepResult {
  if (pixelExtent <= 0 || minPixelSpacing <= 0) {
    throw new RangeError('Viewport dimensions and minPixelSpacing must be strictly positive');
  }
  if (span <= 0) {
    throw new RangeError('Span must be strictly positive');
  }

  return isTime
    ? calculateTimeNiceStep(span, pixelExtent, minPixelSpacing)
    : calculateDecimalNiceStep(span, pixelExtent, minPixelSpacing);
}

function generateGridLines(min: number, max: number, step: number): number[] {
  const lines: number[] = [];
  const startIndex = Math.ceil((min - 1e-9) / step);
  const endIndex = Math.floor((max + 1e-9) / step);

  for (let i = startIndex; i <= endIndex; i++) {
    let val = cleanPrecision(i * step);
    if (val < min && min - val < 1e-9) {
      val = min;
    }
    if (val > max && val - max < 1e-9) {
      val = max;
    }
    if (val >= min && val <= max) {
      if (lines.length === 0 || val > lines[lines.length - 1] + 1e-12) {
        lines.push(val);
      }
    }
  }
  return lines;
}

export function calculateGridSteps(params: GridCalculationParams): GridStepsResult {
  const { viewport, priceRange, timeRange, minPixelSpacing = { x: 80, y: 40 } } = params;

  if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('Viewport dimensions must be strictly positive');
  }

  if (priceRange.min >= priceRange.max || timeRange.min >= timeRange.max) {
    throw new RangeError('Range min must be strictly less than max');
  }

  const minX = minPixelSpacing.x ?? 80;
  const minY = minPixelSpacing.y ?? 40;

  if (minX <= 0 || minY <= 0) {
    throw new RangeError('Minimum pixel spacing must be strictly positive');
  }

  const priceSpan = priceRange.max - priceRange.min;
  const timeSpan = timeRange.max - timeRange.min;

  const priceStepResult = calculateNiceStep(priceSpan, viewport.height, minY, false);
  const timeStepResult = calculateNiceStep(timeSpan, viewport.width, minX, true);

  const priceLines = generateGridLines(priceRange.min, priceRange.max, priceStepResult.step);
  const timeLines = generateGridLines(timeRange.min, timeRange.max, timeStepResult.step);

  return {
    priceStep: priceStepResult.step,
    timeStep: timeStepResult.step,
    priceSubStep: priceStepResult.subStep,
    timeSubStep: timeStepResult.subStep,
    subPriceAlpha: priceStepResult.subdivisionAlpha,
    subTimeAlpha: timeStepResult.subdivisionAlpha,
    priceLines,
    timeLines
  };
}