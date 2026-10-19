import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerToken,
  isSessionAuthFailure,
  shouldInvalidateSession,
} from '../src/api/authFailure.js';

test('extracts bearer tokens without accepting other authorization schemes', () => {
  assert.equal(bearerToken('Bearer session-token'), 'session-token');
  assert.equal(bearerToken('Basic session-token'), '');
  assert.equal(bearerToken(''), '');
});

test('authenticated 401 and explicit session codes end the current session', () => {
  const authorization = 'Bearer current-token';
  assert.equal(isSessionAuthFailure({ status: 401, authorization }), true);
  assert.equal(isSessionAuthFailure({ status: 403, code: 'TOKEN_EXPIRED', authorization }), true);
  assert.equal(isSessionAuthFailure({ status: 403, code: 'ACCOUNT_SUSPENDED', authorization }), true);
});

test('public login failures and ordinary forbidden responses do not end a session', () => {
  assert.equal(isSessionAuthFailure({ status: 401, authorization: '' }), false);
  assert.equal(isSessionAuthFailure({ status: 403, code: 'FORBIDDEN', authorization: 'Bearer current-token' }), false);
});

test('recognises the legacy expired-token response during a rolling deployment', () => {
  assert.equal(isSessionAuthFailure({
    status: 403,
    message: 'Invalid or expired token',
    authorization: 'Bearer current-token',
  }), true);
});

test('a delayed failure from an old token cannot log out a newer session', () => {
  assert.equal(shouldInvalidateSession({
    currentToken: 'new-token',
    status: 401,
    code: 'TOKEN_EXPIRED',
    authorization: 'Bearer old-token',
  }), false);
  assert.equal(shouldInvalidateSession({
    currentToken: 'new-token',
    status: 401,
    code: 'TOKEN_EXPIRED',
    authorization: 'Bearer new-token',
  }), true);
});
