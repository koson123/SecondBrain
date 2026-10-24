const database = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("secondbrain-captures", 1);
  request.onupgradeneeded = () =>
    request.result.createObjectStore("captures", { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function operation(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
) {
  const db = await database;
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction("captures", mode);
    const req = action(tx.objectStore("captures"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const pending = () => operation("readonly", (s) => s.getAll());
export const enqueue = (item: any) =>
  operation("readwrite", (s) => s.put(item));
export const dequeue = (id: string) =>
  operation("readwrite", (s) => s.delete(id));
