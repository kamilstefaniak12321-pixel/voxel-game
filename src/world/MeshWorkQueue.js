// Indexed heap: one entry per chunk, O(log n) enqueue/remove, no full scan
// or sort on each frame. Reprioritize only when the player's chunk changes.
export class MeshWorkQueue {
    constructor(priority) {
        this.priority = priority;
        this.heap = [];
        this.entries = new Map();
        this.sequence = 0;
    }
    get size() { return this.entries.size; }
    has(chunk) { return this.entries.has(chunk); }
    *[Symbol.iterator]() { yield* this.entries.keys(); }
    clear() { this.heap.length = 0; this.entries.clear(); }
    less(a, b) { return a.priority < b.priority || (a.priority === b.priority && a.sequence < b.sequence); }
    swap(a, b) {
        [this.heap[a], this.heap[b]] = [this.heap[b], this.heap[a]];
        this.heap[a].index = a; this.heap[b].index = b;
    }
    up(index) {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!this.less(this.heap[index], this.heap[parent])) break;
            this.swap(index, parent); index = parent;
        }
        return index;
    }
    down(index) {
        for (;;) {
            const left = index * 2 + 1, right = left + 1;
            let best = index;
            if (left < this.heap.length && this.less(this.heap[left], this.heap[best])) best = left;
            if (right < this.heap.length && this.less(this.heap[right], this.heap[best])) best = right;
            if (best === index) return;
            this.swap(index, best); index = best;
        }
    }
    add(chunk) {
        const existing = this.entries.get(chunk);
        if (existing) {
            existing.priority = this.priority(chunk);
            this.down(this.up(existing.index));
            return this;
        }
        const entry = { chunk, priority: this.priority(chunk), sequence: this.sequence++, index: this.heap.length };
        this.entries.set(chunk, entry); this.heap.push(entry); this.up(entry.index);
        return this;
    }
    delete(chunk) {
        const entry = this.entries.get(chunk);
        if (!entry) return false;
        this.entries.delete(chunk);
        const last = this.heap.pop();
        if (last !== entry) {
            this.heap[entry.index] = last; last.index = entry.index;
            this.down(this.up(last.index));
        }
        return true;
    }
    peek() { return this.heap[0]?.chunk ?? null; }
    pop() { const chunk = this.peek(); if (chunk) this.delete(chunk); return chunk; }
    reprioritize() {
        for (const entry of this.heap) entry.priority = this.priority(entry.chunk);
        for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) this.down(i);
    }
}
