'use strict';

const { ApiError } = require('../middleware/errorHandler');

/**
 * Predefined license durations offered in the admin UI. The expiry date is
 * always derived from these on the server, so the frontend's preview can never
 * disagree with what is stored.
 */
const DURATIONS = {
  '1_month': { label: '1 Month', months: 1 },
  '3_months': { label: '3 Months', months: 3 },
  '6_months': { label: '6 Months', months: 6 },
  '1_year': { label: '1 Year', months: 12 },
  custom: { label: 'Custom Date', months: null },
};

const DURATION_KEYS = Object.keys(DURATIONS);

function parseDate(value, label) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `${label} is not a valid date`, 'INVALID_DATE');
  }
  return d;
}

/**
 * Adds whole months in UTC, clamping the day so that adding a month to 31 Jan
 * yields 28/29 Feb rather than rolling into March.
 */
function addMonths(date, months) {
  const day = date.getUTCDate();
  const result = new Date(date.getTime());
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Start of the given calendar day, in UTC. */
function startOfDay(date) {
  const d = new Date(date.getTime());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * End of the given calendar day, in UTC, so a license issued through
 * 23 Sep 2027 stays valid for the whole of that day.
 */
function endOfDay(date) {
  const d = new Date(date.getTime());
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolves { startDate, duration, expiryDate } into the concrete dates to
 * store. For a preset duration the expiry is computed and any supplied
 * expiryDate is ignored; for "custom" the admin picks both ends.
 *
 * @returns {{ startDate: Date, expiryDate: Date, duration: string }}
 */
function resolveLicensePeriod({ startDate, expiryDate, duration }) {
  const key = duration || 'custom';
  if (!DURATION_KEYS.includes(key)) {
    throw new ApiError(400, 'Unknown license duration', 'INVALID_DURATION');
  }

  const start = startOfDay(parseDate(startDate, 'Start date'));

  let end;
  if (key === 'custom') {
    if (!expiryDate) {
      throw new ApiError(400, 'Expiry date is required for a custom duration', 'EXPIRY_REQUIRED');
    }
    end = endOfDay(parseDate(expiryDate, 'Expiry date'));
  } else {
    end = endOfDay(addMonths(start, DURATIONS[key].months));
  }

  if (end.getTime() <= start.getTime()) {
    throw new ApiError(400, 'Expiry date must be after the start date', 'INVALID_PERIOD');
  }

  return { startDate: start, expiryDate: end, duration: key };
}

module.exports = { DURATIONS, DURATION_KEYS, resolveLicensePeriod, startOfDay, endOfDay, addMonths };
