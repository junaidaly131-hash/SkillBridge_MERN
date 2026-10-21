import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableDatabaseError } from '../config/database.js';

test('temporary DNS and network database failures are retryable', () => {
  for (const code of ['ETIMEOUT', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET']) {
    assert.equal(isRetryableDatabaseError({ code }), true);
  }
  assert.equal(isRetryableDatabaseError({ name: 'MongooseServerSelectionError' }), true);
});

test('configuration and authentication database failures are not retried forever', () => {
  assert.equal(isRetryableDatabaseError({ name: 'MongoParseError' }), false);
  assert.equal(isRetryableDatabaseError({ name: 'MongoServerError', code: 18 }), false);
});
