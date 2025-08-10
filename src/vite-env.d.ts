/// <reference types="vite/client" />

// Allow dynamic imports without type declarations for pdfjs-dist UMD builds
declare module 'pdfjs-dist/build/pdf' {
  const pdfjs: any
  export = pdfjs
}
