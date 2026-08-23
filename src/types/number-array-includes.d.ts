export {};

declare global {
  interface Array<T> {
    includes(searchElement: T extends number ? number : T, fromIndex?: number): boolean;
  }

  interface ReadonlyArray<T> {
    includes(searchElement: T extends number ? number : T, fromIndex?: number): boolean;
  }
}
