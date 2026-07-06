// Vercel serverless entry point.
// Vercel treats every file under /api as a serverless function. We simply
// re-export the Express app (which skips app.listen when process.env.VERCEL
// is set) so all /api/* requests are handled by it.
import app from '../server/index.js';

export default app;
