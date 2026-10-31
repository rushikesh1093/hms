import { describe, expect, it, vi } from 'vitest';
import { applyFieldErrors, getErrorCode, getErrorMessage } from '../services/api';

const apiError = (status, error) => ({ response: { status, data: { error } } });

describe('API error helpers', () => {
  it('returns the server message', () => {
    expect(getErrorMessage(apiError(404, { code: 'not_found', message: 'Patient not found' }))).toBe('Patient not found');
    expect(getErrorCode(apiError(409, { code: 'possible_duplicate', message: 'x' }))).toBe('possible_duplicate');
  });

  it('joins field validation messages', () => {
    const e = apiError(422, {
      code: 'validation_error',
      message: 'One or more fields are invalid',
      details: [
        { field: 'mobile_number', message: 'Invalid' },
        { field: '', message: 'Follow-up date is required' },
      ],
    });
    expect(getErrorMessage(e)).toBe('Mobile number: Invalid • Follow-up date is required');
  });

  it('handles network errors', () => {
    expect(getErrorMessage({ request: {} })).toMatch(/cannot reach the server/i);
  });

  it('maps field errors onto a form', () => {
    const setError = vi.fn();
    const matched = applyFieldErrors(apiError(422, { details: [{ field: 'right_eye_axis', message: 'bad' }] }), setError);
    expect(matched).toBe(true);
    expect(setError).toHaveBeenCalledWith('right_eye_axis', { type: 'server', message: 'bad' });
  });
});
