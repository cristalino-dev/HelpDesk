import "@testing-library/jest-dom"

import { TextEncoder, TextDecoder } from 'util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder as any;

// Minimal polyfill for Request/Response if needed by Next.js components
if (typeof Request === 'undefined') {
  (global as any).Request = class Request {
    constructor(_input: any, _init: any) {}
  } as any;
  (global as any).Response = class Response {
    constructor(_body: any, _init: any) {}
    static json(data: any) { return new Response(JSON.stringify(data), {}); }
  } as any;
  (global as any).Headers = class Headers {
    constructor(_init: any) {}
  } as any;
}
