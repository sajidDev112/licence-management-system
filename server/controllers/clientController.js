'use strict';

const clientService = require('../services/clientService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const list = asyncHandler(async (req, res) => {
  const clients = await clientService.listClients();
  res.json({ success: true, count: clients.length, clients });
});

const create = asyncHandler(async (req, res) => {
  const client = await clientService.createClient(req.body);
  res.status(201).json({ success: true, message: 'Client added successfully', client });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, client: await clientService.getClientById(req.params.id) });
});

const update = asyncHandler(async (req, res) => {
  const client = await clientService.updateClient(req.params.id, req.body);
  res.json({ success: true, message: 'Client updated successfully', client });
});

const remove = asyncHandler(async (req, res) => {
  await clientService.deleteClient(req.params.id);
  res.json({ success: true, message: 'Client deleted successfully' });
});

/**
 * Public endpoint for the product's login screen. Returns the client's identity
 * and their licenses, so the product can sign the user in and decide what they
 * may access without a second round trip. Never exposes the password hash.
 */
const login = asyncHandler(async (req, res) => {
  const { username, password, productName } = req.body;
  const { client, licenses } = await clientService.login({ username, password, productName });

  res.json({
    success: true,
    valid: true,
    message: 'Login successful',
    client,
    licenses,
    // Convenience flag: true when at least one returned license is usable now.
    hasValidLicense: licenses.some((l) => l.valid),
  });
});

module.exports = { list, create, getOne, update, remove, login };
