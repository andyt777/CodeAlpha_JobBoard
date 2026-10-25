import { HttpError } from './errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const missing = (value) => value === undefined || value === null || value === '';

export function string(value, field, { required = true, min = 1, max = 255 } = {}) {
  if (missing(value)) {
    if (required) throw new HttpError(400, `"${field}" is required`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `"${field}" must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, `"${field}" must be between ${min} and ${max} characters`);
  }
  return trimmed;
}

export function email(value, field = 'email') {
  const v = string(value, field, { max: 254 }).toLowerCase();
  if (!EMAIL.test(v)) throw new HttpError(400, `"${field}" must be a valid email`);
  return v;
}

export function integer(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (missing(value)) {
    if (required) throw new HttpError(400, `"${field}" is required`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `"${field}" must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function number(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (missing(value)) {
    if (required) throw new HttpError(400, `"${field}" is required`);
    return null;
  }
  const n = Number(value);
  if (typeof value === 'boolean' || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `"${field}" must be a number between ${min} and ${max}`);
  }
  return n;
}

export function boolean(value, field, { fallback = null } = {}) {
  if (missing(value)) return fallback;
  if (typeof value !== 'boolean') throw new HttpError(400, `"${field}" must be true or false`);
  return value;
}

export function array(value, field, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value)) throw new HttpError(400, `"${field}" must be an array`);
  if (value.length < min || value.length > max) {
    throw new HttpError(400, `"${field}" must contain between ${min} and ${max} entries`);
  }
  return value;
}

// Returns an ISO-8601 UTC string so dates sort and compare correctly as text in SQLite.
export function date(value, field, { required = true } = {}) {
  if (missing(value)) {
    if (required) throw new HttpError(400, `"${field}" is required`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `"${field}" must be a valid date`);
  return d.toISOString();
}

export function oneOf(value, field, allowed, { required = true, fallback = null } = {}) {
  if (missing(value)) {
    if (required && fallback === null) throw new HttpError(400, `"${field}" is required`);
    return fallback;
  }
  if (!allowed.includes(value)) throw new HttpError(400, `"${field}" must be one of: ${allowed.join(', ')}`);
  return value;
}

export function id(value, field = 'id') {
  return integer(value, field, { min: 1 });
}
