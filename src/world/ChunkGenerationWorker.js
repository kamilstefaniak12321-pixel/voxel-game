import { ChunkGenerationData, generationTransfers } from './ChunkGenerationData.js';

let generation;
self.onmessage = ({ data: message }) => {
    try {
        if (message.type === 'init') {
            generation = new ChunkGenerationData(message.terrain, message.seed);
        } else if (message.type === 'chunk' && generation) {
            const data = generation.generate(message.cx, message.cz, message.saved);
            self.postMessage({ type: 'chunk', id: message.id, data }, generationTransfers(data));
        }
    } catch (error) {
        self.postMessage({ type: 'error', id: message.id, message: String(error?.message ?? error) });
    }
};
