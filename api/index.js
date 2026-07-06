// Vercel serverless entry point.
//
// We import the Express app *dynamically* and capture any module-load error so a
// crash during import surfaces as a readable JSON response instead of an opaque
// FUNCTION_INVOCATION_FAILED. (Static `import app from ...` would throw at module
// evaluation and there'd be nothing left to report the error with.)
const appPromise = import('../server/index.js')
  .then((m) => m.default)
  .catch((err) => err);

export default async function handler(req, res) {
  const app = await appPromise;
  if (app instanceof Error) {
    console.error('[boot] failed to load server app:', app);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Server failed to start.',
        message: app.message,
        stack: (app.stack || '').split('\n').slice(0, 20),
      })
    );
    return;
  }
  return app(req, res);
}
