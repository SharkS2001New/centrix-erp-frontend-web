const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

export function portfolioPdfPageRanges(canvasWidth, canvasHeight, blocks = []) {
  const maxPageHeight = Math.floor((canvasWidth * PAGE_HEIGHT_MM) / PAGE_WIDTH_MM);
  const contentBlocks = blocks
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end) && block.end > block.start)
    .map((block) => ({
      start: Math.max(0, Math.floor(block.start)),
      end: Math.min(canvasHeight, Math.ceil(block.end)),
    }))
    .filter((block) => block.end > block.start)
    .sort((left, right) => left.start - right.start);

  if (!contentBlocks.length) {
    const ranges = [];
    for (let y = 0; y < canvasHeight; y += maxPageHeight) {
      ranges.push({ y, height: Math.min(maxPageHeight, canvasHeight - y) });
    }
    return ranges;
  }

  const ranges = [];
  let pageStart = 0;
  let previousBlockEnd = 0;

  for (const block of contentBlocks) {
    if (block.start < previousBlockEnd) {
      throw new Error("Portfolio PDF content blocks overlap.");
    }

    const blockHeight = block.end - block.start;
    if (blockHeight > maxPageHeight) {
      if (block.start > pageStart) {
        ranges.push({ y: pageStart, height: block.start - pageStart });
      }
      ranges.push({ y: block.start, height: blockHeight, fitToPage: true });
      pageStart = block.end;
      previousBlockEnd = block.end;
      continue;
    }

    if (block.end - pageStart > maxPageHeight) {
      if (block.start <= pageStart) {
        throw new Error("Portfolio PDF content cannot be fitted on an A4 page.");
      }
      ranges.push({ y: pageStart, height: block.start - pageStart });
      pageStart = block.start;
    }
    previousBlockEnd = block.end;
  }

  if (pageStart < canvasHeight) {
    ranges.push({ y: pageStart, height: canvasHeight - pageStart });
  }

  return ranges;
}
