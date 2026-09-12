function channelValue(pixels: Uint8ClampedArray, offset: number, channel: number) {
  const alpha = pixels[offset + 3] / 255;
  if (channel === 3) return pixels[offset + 3];
  return pixels[offset + channel] * alpha + 255 * (1 - alpha);
}

function blockSsim(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  width: number,
  xStart: number,
  yStart: number,
  blockWidth: number,
  blockHeight: number,
  channel: number
) {
  const count = blockWidth * blockHeight;
  let leftSum = 0;
  let rightSum = 0;
  for (let y = yStart; y < yStart + blockHeight; y += 1) {
    for (let x = xStart; x < xStart + blockWidth; x += 1) {
      const offset = (y * width + x) * 4;
      leftSum += channelValue(left, offset, channel);
      rightSum += channelValue(right, offset, channel);
    }
  }
  const leftMean = leftSum / count;
  const rightMean = rightSum / count;
  let leftVariance = 0;
  let rightVariance = 0;
  let covariance = 0;
  for (let y = yStart; y < yStart + blockHeight; y += 1) {
    for (let x = xStart; x < xStart + blockWidth; x += 1) {
      const offset = (y * width + x) * 4;
      const leftDelta = channelValue(left, offset, channel) - leftMean;
      const rightDelta = channelValue(right, offset, channel) - rightMean;
      leftVariance += leftDelta * leftDelta;
      rightVariance += rightDelta * rightDelta;
      covariance += leftDelta * rightDelta;
    }
  }
  const divisor = Math.max(1, count - 1);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  leftVariance /= divisor;
  rightVariance /= divisor;
  covariance /= divisor;
  return (
    ((2 * leftMean * rightMean + c1) * (2 * covariance + c2)) /
    ((leftMean ** 2 + rightMean ** 2 + c1) * (leftVariance + rightVariance + c2))
  );
}

export function computeRgbaSsim(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  width: number,
  height: number
) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    left.length !== width * height * 4 ||
    right.length !== left.length
  ) {
    throw new Error("error.image_upload.invalid");
  }
  const weights = [0.3, 0.59, 0.11, 0.25];
  let total = 0;
  let blocks = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const blockWidth = Math.min(8, width - x);
      const blockHeight = Math.min(8, height - y);
      let weighted = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        weighted += weights[channel] * blockSsim(
          left,
          right,
          width,
          x,
          y,
          blockWidth,
          blockHeight,
          channel
        );
      }
      total += weighted / weights.reduce((sum, weight) => sum + weight, 0);
      blocks += 1;
    }
  }
  return Math.max(-1, Math.min(1, total / blocks));
}
