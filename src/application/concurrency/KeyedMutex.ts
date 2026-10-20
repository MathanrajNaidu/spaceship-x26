/**
 * Serialises async work that shares a key. Different keys run independently.
 * A failure in one task does not skip the tasks waiting behind it.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) {
        this.tails.delete(key);
      }
    });
    return run;
  }
}
