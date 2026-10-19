import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';

const SECRET = 'auth-middleware-test-secret';

function invoke(authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, next: false }); },
    };
    authenticateToken(req, res, () => resolve({ status: 200, body: null, next: true }));
  });
}

test('missing access token returns a coded 401', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    const result = await invoke();
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'AUTH_REQUIRED');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('expired access token returns TOKEN_EXPIRED with 401', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    const token = jwt.sign({ userId: '64b000000000000000000001' }, SECRET, { expiresIn: -1 });
    const result = await invoke(`Bearer ${token}`);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'TOKEN_EXPIRED');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('invalid access token returns INVALID_TOKEN with 401', async () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    const result = await invoke('Bearer definitely-not-a-jwt');
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'INVALID_TOKEN');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
