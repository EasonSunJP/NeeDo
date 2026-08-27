function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForService({ name, detector, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (await detector()) {
      return;
    }

    if (Date.now() >= deadline) {
      throw new Error(`${name} did not become healthy within ${timeoutMs}ms`);
    }

    await delay(intervalMs);
  }
}
