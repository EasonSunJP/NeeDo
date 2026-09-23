const cachedImages = new Map<string, { image: HTMLImageElement; ready: Promise<void> }>();

export function preloadSplashImage(url: string): Promise<void> {
  const existing = cachedImages.get(url);
  if (existing) return existing.ready;

  const image = new Image();
  const ready = new Promise<void>((resolve) => {
    image.onload = () => {
      if (typeof image.decode === "function") {
        void Promise.resolve().then(() => image.decode()).catch(() => undefined).then(() => resolve());
      } else {
        resolve();
      }
    };
    image.onerror = () => {
      cachedImages.delete(url);
      resolve();
    };
  });
  cachedImages.set(url, { image, ready });
  image.src = url;
  return ready;
}
