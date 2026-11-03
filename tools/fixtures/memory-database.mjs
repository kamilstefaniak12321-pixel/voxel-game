// Port IndexedDB do testów WorldStorage, bez przeglądarki i plików.
// Produkcyjny kod wybiera rekordy, pakuje bloki i wykonuje odczyt/zapis.
// Tu zastępujemy tylko asynchroniczne żądania, transakcję i structured clone.
export function memoryDatabase() {
    const tables = { worlds: new Map(), chunks: new Map() };
    const request = value => {
        const result = { result: structuredClone(value) };
        queueMicrotask(() => result.onsuccess?.());
        return result;
    };
    return {
        transaction() {
            const transaction = {
                objectStore(name) {
                    const table = tables[name];
                    return {
                        put(record) {
                            const key = name === 'worlds' ? record.id : JSON.stringify([record.worldId, record.cx, record.cz]);
                            table.set(key, structuredClone(record));
                        },
                        getAll: () => request([...table.values()]),
                        index: () => ({ getAll: id => request([...table.values()].filter(record => record.worldId === id)) })
                    };
                },
                commit() { queueMicrotask(() => transaction.oncomplete?.()); }
            };
            return transaction;
        }
    };
}
