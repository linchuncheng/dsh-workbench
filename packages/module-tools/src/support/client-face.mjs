import { readFileSync } from 'node:fs';

function anyStub(path = 'stub') {
  const target = function () {
    return anyStub(`${path}()`);
  };
  return new Proxy(target, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined;
      if (key === 'length') return 0;
      if (key === 'toString') return () => path;
      return anyStub(`${path}.${String(key)}`);
    },
    apply() {
      return anyStub(`${path}()`);
    },
  });
}

function fakeReact() {
  const element = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const passthrough = (props, ...children) => element('stub:passthrough', props, ...children);
  const base = {
    createElement: element,
    createElementNS: (_namespace, type, props, ...children) => element(type, props, ...children),
    Fragment: 'Fragment',
    Component: class {},
    PureComponent: class {},
    createContext: (value) => ({ Provider: passthrough, Consumer: passthrough, _currentValue: value }),
    useContext: () => anyStub('context'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useReducer: (_reducer, initial) => [initial, () => {}],
    useMemo: (factory) => factory(),
    useCallback: (factory) => factory,
    useRef: (initial) => ({ current: initial ?? null }),
    useEffect: () => {},
    useLayoutEffect: () => {},
    useInsertionEffect: () => {},
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useId: () => 'wb-id',
    useTransition: () => [false, (fn) => fn()],
    useDeferredValue: (value) => value,
    isValidElement: (value) => typeof value === 'object' && value !== null && 'type' in value,
    cloneElement: (node, props, ...children) =>
      element(node.type, { ...(node.props ?? {}), ...(props ?? {}) }, ...children),
    memo: (fn) => fn,
    forwardRef: (fn) => fn,
    Children: {
      toArray: (value) =>
        Array.isArray(value) ? value : value === undefined || value === null ? [] : [value],
      map: (value, fn) =>
        (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(fn),
      count: (value) =>
        Array.isArray(value) ? value.length : value === undefined || value === null ? 0 : 1,
    },
  };
  return new Proxy(base, { get: (target, key) => (key in target ? target[key] : () => null) });
}

function fakeJsxRuntime() {
  const react = fakeReact();
  return {
    Fragment: react.Fragment,
    jsx: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
    jsxs: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
    jsxDEV: (type, props) => react.createElement(type, props, ...(props?.children ?? [])),
  };
}

function fakeDshPackage() {
  const stub = (props) => ({
    type: 'stub:dsh',
    props: props ?? {},
    children:
      props?.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children],
  });
  return new Proxy({}, { get: () => stub });
}

function fakeKit() {
  const callable = () => anyStub('result');
  return {
    hooks: new Proxy({}, { get: () => callable }),
    components: new Proxy(
      {},
      {
        get: (_target, key) => (props) => {
          const kids = props?.children;
          return {
            type: `stub:${String(key)}`,
            props: props ?? {},
            children: kids === undefined ? [] : Array.isArray(kids) ? kids : [kids],
          };
        },
      },
    ),
    api: new Proxy({}, { get: () => callable }),
    lib: anyStub('lib'),
  };
}

function loadFace(clientFile, makeKit) {
  let captured;
  const fakeWindow = {
    location: { search: '', href: 'http://127.0.0.1:3081/' },
    __ModuleLoader__: {
      load: (entry) => {
        captured = entry;
      },
    },
  };
  const expose = { window: fakeWindow, module: undefined, exports: undefined };
  const source = readFileSync(clientFile, 'utf8');
  const factoryOf = new Function('window', `${source}\nreturn undefined;`);
  factoryOf(fakeWindow);
  if (captured === undefined) throw new Error('client.js 没有调用 __ModuleLoader__.load()');
  const module = { exports: {} };
  expose.module = module;
  expose.exports = module.exports;
  const fakeRequire = (id) => {
    if (id === 'react') return fakeReact();
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return fakeJsxRuntime();
    if (id === '@dsh-workbench/core/client') return { kit: makeKit() };
    if (id.startsWith('@deepseek-ai/')) return fakeDshPackage();
    throw new Error(`产物 require 了没有桩的外部依赖：${id}`);
  };
  const produced = captured.factory(fakeRequire);
  return { id: captured.id, exports: produced ?? module.exports };
}

export { fakeDshPackage, fakeKit, fakeReact, loadFace };

function clientContextOf(register) {
  return {
    get: (key) => (key === 'workbenchUnits' ? { registerUnit: register } : undefined),
    effect: (fn) => {
      fn();
      return () => {};
    },
    provide: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

function loadRegisteredClientFace(clientFile) {
  const loaded = loadFace(clientFile, () => fakeKit());
  const face = loaded.exports;
  const apply = face?.apply ?? face?.default?.apply;
  if (typeof apply !== 'function') throw new Error('client.js 没有导出 apply（工作台无法挂载该模块）');
  let registered;
  apply(
    clientContextOf((value) => {
      registered = value;
      return () => {};
    }),
  );
  if (registered === undefined) throw new Error('client.js 的 apply 没有登记单元');
  return registered;
}

export { clientContextOf, loadRegisteredClientFace };
