export class ObjectPool<T> {
  private readonly items: T[] = [];

  public acquire(factory: () => T): T {
    return this.items.pop() ?? factory();
  }

  public release(item: T): void {
    this.items.push(item);
  }
}
