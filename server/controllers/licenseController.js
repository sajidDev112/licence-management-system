'use strict';

const licenseService = require('../services/licenseService');
const mailService = require('../services/mailService');
const brandingService = require('../services/brandingService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const create = asyncHandler(async (req, res) => {
  const license = await licenseService.createLicense(req.body);
  res.status(201).json({ success: true, message: 'License created successfully', license });
});

const list = asyncHandler(async (req, res) => {
  const licenses = await licenseService.listLicenses();
  res.json({ success: true, count: licenses.length, licenses });
});

const stats = asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await licenseService.getStats() });
});

const getOne = asyncHandler(async (req, res) => {
  const license = await licenseService.getLicenseById(req.params.id);
  res.json({ success: true, license });
});

const update = asyncHandler(async (req, res) => {
  const license = await licenseService.updateLicense(req.params.id, req.body);
  res.json({ success: true, message: 'License updated successfully', license });
});

const setStatus = asyncHandler(async (req, res) => {
  const { deactivated } = req.body;
  const license = await licenseService.setLicenseDeactivated(req.params.id, deactivated);
  res.json({
    success: true,
    message: deactivated ? 'License deactivated' : 'License reactivated',
    license,
  });
});

/** Whether the server can send email at all — the UI adapts to the answer. */
const mailStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, configured: mailService.isConfigured() });
});

const share = asyncHandler(async (req, res) => {
  const license = await licenseService.getLicenseById(req.params.id);
  const { recipients } = req.body;

  // The logo is decorative; a branding failure must not block the email.
  let logo = null;
  try {
    logo = (await brandingService.getBranding()).logo;
  } catch {
    logo = null;
  }

  const result = await mailService.sendLicense({ license, recipients, logo });

  res.json({
    success: true,
    message: 'License details sent to the recipient',
    sentTo: result.accepted,
  });
});

const remove = asyncHandler(async (req, res) => {
  await licenseService.deleteLicense(req.params.id);
  res.json({ success: true, message: 'License deleted successfully' });
});

/** Products may send either spelling of the machine identifier. */
const readMachineNumber = (body) => body.machineNumber ?? body.machine_number;

/**
 * Public endpoint used by the product. Response shapes are fixed by contract,
 * and no internal fields (document id, client user id, timestamps) are exposed.
 */
const verify = asyncHandler(async (req, res) => {
  const { licenseKey, productName } = req.body;
  const machineNumber = readMachineNumber(req.body);
  const result = await licenseService.checkLicense({ licenseKey, productName, machineNumber });

  if (result.outcome === 'not_found') {
    return res.status(404).json({
      success: false,
      valid: false,
      message: 'Invalid license key',
    });
  }

  if (result.outcome === 'product_mismatch') {
    return res.status(403).json({
      success: false,
      valid: false,
      message: 'License is not valid for this product',
    });
  }

  // The key is already in use on another machine. The machine it belongs to is
  // deliberately not named back: that would hand out a value an attacker could
  // simply replay.
  if (result.outcome === 'machine_mismatch') {
    return res.status(403).json({
      success: false,
      valid: false,
      message: 'License is already in use on another machine',
    });
  }

  if (result.outcome === 'deactivated') {
    return res.status(200).json({
      success: true,
      valid: false,
      message: 'License has been deactivated',
      license: {
        licenseKey: result.license.licenseKey,
        productName: result.license.productName,
        startDate: result.license.startDate,
        expiryDate: result.license.expiryDate,
        status: 'deactivated',
      },
    });
  }

  if (result.outcome === 'expired') {
    return res.status(200).json({
      success: true,
      valid: false,
      message: 'License has expired',
      license: {
        licenseKey: result.license.licenseKey,
        productName: result.license.productName,
        startDate: result.license.startDate,
        expiryDate: result.license.expiryDate,
        status: 'expired',
      },
    });
  }

  if (result.outcome === 'pending') {
    return res.status(200).json({
      success: true,
      valid: false,
      message: 'License has not started yet',
      license: {
        licenseKey: result.license.licenseKey,
        productName: result.license.productName,
        startDate: result.license.startDate,
        expiryDate: result.license.expiryDate,
        status: 'pending',
      },
    });
  }

  return res.status(200).json({
    success: true,
    valid: true,
    message: 'License is valid',
    license: {
      licenseKey: result.license.licenseKey,
      clientName: result.license.clientName,
      companyName: result.license.companyName,
      productName: result.license.productName,
      machineNumber: result.license.machineNumber,
      startDate: result.license.startDate,
      expiryDate: result.license.expiryDate,
      status: 'active',
    },
  });
});

/**
 * Lightweight polling endpoint the product calls hourly. Same checks as
 * /verify, but a flat response shaped for a periodic refresh. Nothing is
 * scheduled server-side; the product owns the interval.
 */
const sync = asyncHandler(async (req, res) => {
  const { licenseKey, productName } = req.body;
  const machineNumber = readMachineNumber(req.body);
  const result = await licenseService.checkLicense({ licenseKey, productName, machineNumber });
  const checkedAt = new Date().toISOString();

  if (result.outcome === 'not_found') {
    return res.status(404).json({
      success: false,
      valid: false,
      status: 'invalid',
      message: 'Invalid license key',
      checkedAt,
    });
  }

  if (result.outcome === 'product_mismatch') {
    return res.status(403).json({
      success: false,
      valid: false,
      status: 'invalid',
      message: 'License is not valid for this product',
      checkedAt,
    });
  }

  if (result.outcome === 'machine_mismatch') {
    return res.status(403).json({
      success: false,
      valid: false,
      status: 'machine_mismatch',
      message: 'License is already in use on another machine',
      checkedAt,
    });
  }

  const messages = {
    valid: 'License is valid',
    expired: 'License has expired',
    pending: 'License has not started yet',
    deactivated: 'License has been deactivated',
  };

  return res.status(200).json({
    success: true,
    valid: result.outcome === 'valid',
    status: result.license.status,
    message: messages[result.outcome],
    licenseKey: result.license.licenseKey,
    productName: result.license.productName,
    machineNumber: result.license.machineNumber,
    startDate: result.license.startDate,
    expiryDate: result.license.expiryDate,
    checkedAt,
  });
});

/**
 * Two self-service endpoints the product calls to correct the details it holds.
 * Both authenticate the same way: the license key plus the machine that claimed
 * it. Kept as separate endpoints so a product can change one without having to
 * send, and risk overwriting, the other.
 */
const updatePoc = asyncHandler(async (req, res) => {
  const { licenseKey, productName } = req.body;
  // Accepts either name for the field, as the two endpoints are a pair.
  const pocName = req.body.pocName ?? req.body.poc_name ?? req.body.clientName;
  const license = await licenseService.updateLicenseContact({
    licenseKey,
    machineNumber: readMachineNumber(req.body),
    productName,
    clientName: pocName,
  });

  res.json({
    success: true,
    message: 'POC name updated',
    license: {
      licenseKey: license.licenseKey,
      pocName: license.clientName,
      email: license.clientUserId,
      productName: license.productName,
      machineNumber: license.machineNumber,
    },
  });
});

const updateEmail = asyncHandler(async (req, res) => {
  const { licenseKey, productName, email } = req.body;
  const license = await licenseService.updateLicenseContact({
    licenseKey,
    machineNumber: readMachineNumber(req.body),
    productName,
    clientUserId: email,
  });

  res.json({
    success: true,
    message: 'Email updated',
    license: {
      licenseKey: license.licenseKey,
      pocName: license.clientName,
      email: license.clientUserId,
      productName: license.productName,
      machineNumber: license.machineNumber,
    },
  });
});

module.exports = {
  create,
  list,
  stats,
  getOne,
  update,
  setStatus,
  share,
  mailStatus,
  remove,
  verify,
  updatePoc,
  updateEmail,
  sync,
};
