import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import files from './routes/files.js';
import { authenticate } from './middleware/authenticate.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origins, methods: ['GET','POST','DELETE'], allowedHeaders: ['Authorization','Content-Type'] }));
app.use(express.json({ limit: '10kb' }));
app.use('/api', rateLimit({ windowMs: 15*60*1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { success:false, error:{ code:'RATE_LIMITED', message:'Too many requests, try again later' } } }));
app.get('/api/health', (_q, r) => r.json({ success:true, data:{ status:'ok', app:'SecureCloud' } }));
app.use('/api/files', authenticate, files);
app.use((_q, r) => r.status(404).json({ success:false, error:{ code:'NOT_FOUND', message:'Route not found' } }));
app.use((err, _q, r, _n) => {
  if (err.code === 'LIMIT_FILE_SIZE') return r.status(413).json({ success:false, error:{ code:'TOO_LARGE', message:`Max file size is ${process.env.MAX_FILE_SIZE_MB||10} MB` } });
  console.error(err.message);
  r.status(500).json({ success:false, error:{ code:'SERVER_ERROR', message:'Something went wrong' } });
});
app.listen(process.env.PORT || 3000, () => console.log('SecureCloud API running'));
