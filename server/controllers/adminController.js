'use strict';

const adminService = require('../services/adminService');
const brandingService = require('../services/brandingService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const login = asyncHandler(async (req, res) => {
  const { token, admin } = await adminService.login(req.body);
  res.json({ success: true, message: 'Signed in successfully', token, admin });
});

/** Lets the frontend confirm a stored token is still good on page load. */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, admin: await adminService.getAdminById(req.admin.id) });
});

const changePassword = asyncHandler(async (req, res) => {
  await adminService.changePassword(req.admin.id, req.body);
  res.json({ success: true, message: 'Password changed successfully' });
});

const listEmails = asyncHandler(async (req, res) => {
  const emails = await adminService.listEmails();
  res.json({ success: true, count: emails.length, emails });
});

const addEmail = asyncHandler(async (req, res) => {
  const email = await adminService.addEmail(req.body);
  res.status(201).json({ success: true, message: 'Email added successfully', email });
});

const updateEmail = asyncHandler(async (req, res) => {
  const email = await adminService.updateEmail(req.params.id, req.body);
  res.json({ success: true, message: 'Email updated successfully', email });
});

const setDefaultEmail = asyncHandler(async (req, res) => {
  const email = await adminService.setDefaultEmail(req.params.id);
  res.json({ success: true, message: 'Default email updated', email });
});

const deleteEmail = asyncHandler(async (req, res) => {
  await adminService.deleteEmail(req.params.id);
  res.json({ success: true, message: 'Email removed successfully' });
});

// --- Branding ----------------------------------------------------------------

/** Public: the console reads this before anyone has signed in. */
const getBranding = asyncHandler(async (req, res) => {
  res.json({ success: true, branding: await brandingService.getBranding() });
});

const setLogo = asyncHandler(async (req, res) => {
  const branding = await brandingService.setLogo(req.body);
  res.json({ success: true, message: 'Logo updated successfully', branding });
});

const clearLogo = asyncHandler(async (req, res) => {
  const branding = await brandingService.clearLogo();
  res.json({ success: true, message: 'Logo removed successfully', branding });
});

module.exports = {
  login,
  me,
  changePassword,
  listEmails,
  addEmail,
  updateEmail,
  setDefaultEmail,
  deleteEmail,
  getBranding,
  setLogo,
  clearLogo,
};
