// server.ts
import express from 'express';
import createSessionRoutes from './routes/session';

const app = express();

app.use(express.json());

// Mount the routes
app.use('/wa', createSessionRoutes());

const PORT = 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
