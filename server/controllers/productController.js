'use strict';

const productService = require('../services/productService');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  res.status(201).json({ success: true, message: 'Product saved successfully', product });
});

const list = asyncHandler(async (req, res) => {
  const products = await productService.listProducts();
  res.json({ success: true, count: products.length, products });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, product: await productService.getProductById(req.params.id) });
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  res.json({ success: true, message: 'Product updated successfully', product });
});

const remove = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  res.json({ success: true, message: 'Product deleted successfully' });
});

module.exports = { create, list, getOne, update, remove };
