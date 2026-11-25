// How a part of CelScene is written and attached (scene.ts).

/** A part is an object of methods and getters whose `this` is the scene. Calling `scenePart<CelScene>()({...})` types `this` without hiding what each member is. */
export function scenePart<T>(): <M extends object>(members: M & ThisType<T>) => M {
  return (members) => members;
}

/** Puts each part's methods and getters on the class's prototype, as if they had been written in the class body (not enumerable, like a class's own methods). */
export function mixInto(cls: { prototype: object }, ...parts: object[]): void {
  const proto = cls.prototype;
  for (const part of parts) {
    for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(part))) {
      if (Object.prototype.hasOwnProperty.call(proto, name)) throw new Error(`scene part: ${name} is defined twice`);
      Object.defineProperty(proto, name, { ...d, enumerable: false });
    }
  }
}
