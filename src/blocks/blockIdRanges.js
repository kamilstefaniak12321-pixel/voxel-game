// Shared allocation helpers. Tree and plant blocks keep their saved IDs.
export const TREE_ID_RANGES = [[100, 239], [1000, 4999]];
export const TREE_ID_SLOTS = 10;
export function idsInRanges(first, count, ranges) {
    return Number.isInteger(first) && ranges.some(([from, to]) => first >= from && first + count - 1 <= to);
}
export function rangesText(ranges, count) {
    return ranges.map(([from, to]) => `${from}-${to - count + 1}`).join(' albo ');
}
