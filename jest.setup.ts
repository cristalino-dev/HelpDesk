import "@testing-library/jest-dom"

import { TextEncoder, TextDecoder } from 'util';
// Node's classes stand in for the DOM's, whose types they do not match, hence
// Object.assign rather than a typed assignment to globalThis.
Object.assign(global, { TextEncoder, TextDecoder });

// Minimal polyfill for Request/Response if needed by Next.js components
if (typeof Request === 'undefined') {
  Object.assign(global, {
    Request: class Request {
      constructor(_input: unknown, _init: unknown) {}
    },
    Response: class Response {
      constructor(_body: unknown, _init: unknown) {}
      static json(data: unknown) { return new Response(JSON.stringify(data), {}); }
    },
    Headers: class Headers {
      constructor(_init: unknown) {}
    },
  });
}
