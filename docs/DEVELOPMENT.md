# Development

## Local development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The application is available at <http://localhost:4000>. Development artifacts are written to `.next-dev`.

Both development and production start commands explicitly listen on `0.0.0.0:4000`, so another service on the same server or local network can call the robot callback endpoints. Configure the host firewall separately if other machines need access.

## Production verification

Build and run the production application:

```bash
npm run build
npm run start
```

Production artifacts remain in Next.js's default `.next` directory.

## Why the build directories are separate

A running `next dev` process loads server chunks from its build directory. If `next build` rewrites that same directory, the live process can retain an old module table while its chunk files are replaced. Typical symptoms include:

```text
TypeError: a[d] is not a function
Cannot find module './<chunk>.js'
```

This project assigns `.next-dev` to development and `.next` to production, so `npm run build` can safely run while the development server is active.

If an old checkout still shows a generated-chunk error, stop the existing Next.js process and restart `npm run dev`. Generated `.next` and `.next-dev` directories may be removed while no Next.js process is running; they do not contain source code.
