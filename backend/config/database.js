import mongoose from 'mongoose';

// Resolving the Atlas SRV record has been measured at ~18s on some networks,
// well past Mongoose's 10s default for buffered operations. Without these the
// first query fired during a slow-but-healthy connect throws
// "buffering timed out after 10000ms" and takes the process down with it.
mongoose.set('bufferTimeoutMS', 45000);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isRetryableDatabaseError(error) {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '');
  return [
    'ETIMEOUT', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'ECONNREFUSED', 'ECONNRESET', 'ESERVFAIL',
  ].includes(code) || name === 'MongooseServerSelectionError';
}

// maxAttempts=0 means keep retrying. The API server uses that mode so a brief
// Atlas DNS/network interruption does not make nodemon or the host crash-loop.
// One-off scripts keep the default single attempt and still fail promptly.
export const connectDB = async ({ maxAttempts = 1, retryDelayMs = 5000 } = {}) => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables. Please check your .env file.');
  }

  let attempt = 0;
  while (maxAttempts === 0 || attempt < maxAttempts) {
    attempt += 1;
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 45000,
      });
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      const canRetry = isRetryableDatabaseError(error) && (maxAttempts === 0 || attempt < maxAttempts);
      if (!canRetry) throw error;
      console.warn(`MongoDB connection unavailable (${error.code || error.name || 'network error'}). Retrying in ${retryDelayMs / 1000}s...`);
      await wait(retryDelayMs);
    }
  }

  throw new Error('MongoDB connection attempts exhausted');
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

