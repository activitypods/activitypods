interface Foo {
  x: number;
}
// ... elsewhere ...
interface Foo {
  y: number;
}

function fn(a: string, b: number) {
  return a;
}

type f = Parameters<typeof fn>;

// INTERESTING
function createStreetLight<C extends string>(colors: C[], defaultColor?: NoInfer<C>) {
  // ...
}
createStreetLight(['red', 'yellow', 'green'], 'red'); // OK
createStreetLight(['red', 'yellow', 'green'], 'blue'); // Error

type Nulled = NonNullable<string | number | undefined>;

type Extracted = Extract<'a' | 'b' | 'c', 'a' | 'f'>;

type Excluded = Exclude<'a' | 'b' | 'c', 'a'>;

interface Todo {
  title: string;
  description: string;
  completed: boolean;
}

type TodoPreview = Pick<Todo, 'title' | 'completed'>;

type TodoPreviewOmit = Omit<Todo, 'description'>;

// THIS BINDINGS
type ObjectDescriptor<D, M> = {
  data?: D;
  methods?: M & ThisType<D & M>; // Type of 'this' in methods is D & M
};

function makeObject<D, M>(desc: ObjectDescriptor<D, M>): D & M {
  let data: object = desc.data || {};
  let methods: object = desc.methods || {};
  return { ...data, ...methods } as D & M;
}

let obj = makeObject({
  data: { x: 0, y: 0 },
  methods: {
    moveBy(dx: number, dy: number) {
      this.x += dx; // Strongly typed this
      this.y += dy; // Strongly typed this
    }
  }
});

obj.x = 10;
obj.y = 20;
obj.moveBy(5, 5);
