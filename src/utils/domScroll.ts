export type ScrollAlignment = "center" | "nearest";

export interface ScrollElementWithinOptions {
  behavior?: ScrollBehavior;
  block?: ScrollAlignment;
  inline?: ScrollAlignment;
}

export function scrollElementWithin(
  container: HTMLElement,
  element: HTMLElement,
  options: ScrollElementWithinOptions = {}
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const elementLeft = elementRect.left - containerRect.left + container.scrollLeft;
  const elementTop = elementRect.top - containerRect.top + container.scrollTop;

  container.scrollTo({
    behavior: options.behavior ?? "auto",
    left: resolveScrollOffset(
      container.scrollLeft,
      container.clientWidth,
      elementLeft,
      elementRect.width,
      options.inline ?? "nearest"
    ),
    top: resolveScrollOffset(
      container.scrollTop,
      container.clientHeight,
      elementTop,
      elementRect.height,
      options.block ?? "nearest"
    )
  });
}

export function resolveScrollOffset(
  currentOffset: number,
  viewportSize: number,
  targetOffset: number,
  targetSize: number,
  alignment: ScrollAlignment
): number {
  if (alignment === "center") {
    return Math.max(0, targetOffset + targetSize / 2 - viewportSize / 2);
  }

  const viewportEnd = currentOffset + viewportSize;
  const targetEnd = targetOffset + targetSize;

  if (targetOffset < currentOffset && targetEnd > viewportEnd) {
    return currentOffset;
  }

  if (targetOffset < currentOffset) {
    return Math.max(0, targetOffset);
  }

  if (targetEnd > viewportEnd) {
    return Math.max(0, targetEnd - viewportSize);
  }

  return currentOffset;
}
